"""Dry-run-first import of the owner-provided legacy Flowvy snapshots."""

from __future__ import annotations

import argparse
import asyncio
import datetime
import json
import os
import sys
import uuid
from dataclasses import asdict

import asyncpg
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from flowvy.services.legacy_user_import import (
    LegacyUserImportError,
    LegacyUserImportService,
    LegacyUserRecord,
)


def _arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Import exact legacy users without calling Telegram, Remnawave, or Tribute.",
    )
    parser.add_argument(
        "--snapshot-at",
        required=True,
        help="UTC-aware timestamp shared by the source backups.",
    )
    parser.add_argument("--expected-users", type=int, default=47)
    parser.add_argument("--expected-believers", type=int, default=9)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Commit the import. Without this flag the command is read-only.",
    )
    return parser.parse_args()


def _required_url(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise LegacyUserImportError(f"{name} is required")
    return value


def _timestamp(value: str) -> datetime.datetime:
    try:
        parsed = datetime.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise LegacyUserImportError("--snapshot-at must be an ISO 8601 timestamp") from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise LegacyUserImportError("--snapshot-at must include a timezone")
    return parsed.astimezone(datetime.UTC)


async def _load_records(
    old_bot_url: str,
    remnawave_url: str,
    snapshot_at: datetime.datetime,
) -> list[LegacyUserRecord]:
    old_connection = await asyncpg.connect(old_bot_url)
    try:
        remnawave_connection = await asyncpg.connect(remnawave_url)
        try:
            old_rows = await old_connection.fetch(
                """
                SELECT telegram_id, username, full_name, remnawave_user_uuid, access_type
                FROM users
                WHERE is_active IS TRUE
                """,
            )
            provider_rows = await remnawave_connection.fetch(
                """
                SELECT t_id, uuid, telegram_id, status, hwid_device_limit, expire_at, tag
                FROM users
                WHERE telegram_id IS NOT NULL
                """,
            )
        finally:
            await remnawave_connection.close()
    finally:
        await old_connection.close()

    old_by_telegram = {int(row["telegram_id"]): row for row in old_rows}
    provider_by_telegram = {int(row["telegram_id"]): row for row in provider_rows}
    if len(old_by_telegram) != len(old_rows) or len(provider_by_telegram) != len(provider_rows):
        raise LegacyUserImportError("A source database contains duplicate Telegram identities")
    if old_by_telegram.keys() != provider_by_telegram.keys():
        raise LegacyUserImportError(
            "Old-bot and Remnawave Telegram identities do not match exactly"
        )

    records: list[LegacyUserRecord] = []
    for telegram_id in sorted(old_by_telegram):
        old = old_by_telegram[telegram_id]
        provider = provider_by_telegram[telegram_id]
        old_uuid = uuid.UUID(str(old["remnawave_user_uuid"]))
        provider_uuid = uuid.UUID(str(provider["uuid"]))
        if old_uuid != provider_uuid:
            raise LegacyUserImportError("Old-bot and Remnawave UUID mappings do not match")
        old_tag = str(old["access_type"] or "").strip().upper()
        provider_tag = str(provider["tag"] or "").strip().upper()
        if old_tag != provider_tag:
            raise LegacyUserImportError("Old-bot and Remnawave access tags do not match")
        provider_expiry = provider["expire_at"].replace(tzinfo=datetime.UTC)
        if provider_expiry <= snapshot_at:
            raise LegacyUserImportError("A mapped Remnawave user was expired at snapshot time")
        records.append(
            LegacyUserRecord(
                telegram_id=telegram_id,
                username=old["username"],
                full_name=(
                    str(old["full_name"] or "").strip()
                    or str(old["username"] or "").strip()
                    or "Telegram user"
                ),
                remnawave_user_id=int(provider["t_id"]),
                remnawave_uuid=provider_uuid,
                status=str(provider["status"]),
                device_limit=provider["hwid_device_limit"],
                expires_at=provider_expiry,
                tag=provider_tag,
            ),
        )
    return records


async def _run(arguments: argparse.Namespace) -> dict[str, object]:
    snapshot_at = _timestamp(arguments.snapshot_at)
    records = await _load_records(
        _required_url("LEGACY_BOT_DATABASE_URL"),
        _required_url("LEGACY_REMNAWAVE_DATABASE_URL"),
        snapshot_at,
    )
    believer_count = sum(record.tag == "BELIEVER" for record in records)
    if len(records) != arguments.expected_users or believer_count != arguments.expected_believers:
        raise LegacyUserImportError("Source aggregate counts differ from the approved snapshot")

    engine = create_async_engine(_required_url("DATABASE_URL"))
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with session_factory() as session, session.begin():
            report = await LegacyUserImportService(session).run(
                records,
                snapshot_at=snapshot_at,
                apply=arguments.apply,
            )
    finally:
        await engine.dispose()
    return asdict(report)


def main() -> int:
    try:
        report = asyncio.run(_run(_arguments()))
    except LegacyUserImportError as exc:
        print(json.dumps({"applied": False, "error": str(exc)}, sort_keys=True))
        return 2
    except Exception:
        print(json.dumps({"applied": False, "error": "Legacy import failed safely"}))
        return 1
    print(json.dumps(report, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
