"""Remnawave request normalization and reconciliation helpers."""

from __future__ import annotations

import datetime
import uuid

from flowvy.schemas.registration import AccessProfileInput
from flowvy.schemas.remnawave import (
    RemnawaveCreateUserRequest,
    RemnawaveUpdateUserRequest,
    RemnawaveUserData,
)


def normalize_utc(value: datetime.datetime) -> datetime.datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        return value.replace(tzinfo=datetime.UTC)
    return value.astimezone(datetime.UTC)


def normalize_provider_expiry(value: datetime.datetime) -> datetime.datetime:
    """Normalize to the millisecond precision observed at the Remnawave boundary."""
    normalized = normalize_utc(value)
    return normalized.replace(microsecond=(normalized.microsecond // 1000) * 1000)


def matches_expiry(left: datetime.datetime, right: datetime.datetime) -> bool:
    return normalize_provider_expiry(left) == normalize_provider_expiry(right)


def profile_update_request(
    profile: AccessProfileInput,
    expire_at: datetime.datetime,
) -> RemnawaveUpdateUserRequest:
    """Build an explicit full-profile update, including nullable fields to clear."""
    return RemnawaveUpdateUserRequest(
        status="ACTIVE",
        traffic_limit_bytes=profile.traffic_limit_bytes,
        traffic_limit_strategy=profile.traffic_limit_strategy,
        expire_at=normalize_provider_expiry(expire_at),
        description=profile.description,
        tag=profile.tag,
        hwid_device_limit=profile.hwid_device_limit,
        active_internal_squads=profile.internal_squad_uuids,
        external_squad_uuid=profile.external_squad_uuid,
    )


def create_user_request(
    telegram_id: int,
    request: RemnawaveUpdateUserRequest,
) -> RemnawaveCreateUserRequest:
    """Convert a validated paid-access target into the official create-user subset."""
    if (
        request.status != "ACTIVE"
        or request.traffic_limit_bytes is None
        or request.traffic_limit_strategy is None
        or request.active_internal_squads is None
    ):
        raise ValueError("Paid access target is incomplete")
    return RemnawaveCreateUserRequest(
        username=f"tg_{telegram_id}",
        status=request.status,
        traffic_limit_bytes=request.traffic_limit_bytes,
        traffic_limit_strategy=request.traffic_limit_strategy,
        expire_at=request.expire_at,
        description=request.description,
        tag=request.tag,
        telegram_id=telegram_id,
        hwid_device_limit=request.hwid_device_limit,
        active_internal_squads=request.active_internal_squads,
        external_squad_uuid=request.external_squad_uuid,
    )


def matches_user_request(
    provider_user: RemnawaveUserData,
    request: RemnawaveUpdateUserRequest,
) -> bool:
    """Compare every explicitly requested access field, not expiry alone."""
    if not matches_expiry(provider_user.expire_at, request.expire_at):
        return False
    comparisons = {
        "status": provider_user.status,
        "traffic_limit_bytes": provider_user.traffic_limit_bytes,
        "traffic_limit_strategy": provider_user.traffic_limit_strategy,
        "description": provider_user.description,
        "tag": provider_user.tag,
        "hwid_device_limit": provider_user.hwid_device_limit,
        "external_squad_uuid": provider_user.external_squad_uuid,
    }
    for field, current in comparisons.items():
        if field in request.model_fields_set:
            desired = getattr(request, field)
            if field == "external_squad_uuid":
                desired = str(desired) if desired is not None else None
            if current != desired:
                return False
    if "active_internal_squads" in request.model_fields_set:
        current_squads = {item.uuid for item in provider_user.active_internal_squads}
        desired_squads = {str(item) for item in request.active_internal_squads or []}
        if current_squads != desired_squads:
            return False
    return True


def provider_profile_snapshot(provider_user: RemnawaveUserData) -> dict[str, object]:
    """Capture only the documented access fields Flowvy can restore exactly."""
    return AccessProfileInput(
        name="Captured base access",
        validity_mode="fixed",
        fixed_expire_at=provider_user.expire_at,
        traffic_limit_bytes=provider_user.traffic_limit_bytes,
        traffic_limit_strategy=provider_user.traffic_limit_strategy,  # type: ignore[arg-type]
        hwid_device_limit=provider_user.hwid_device_limit,
        tag=provider_user.tag,
        description=provider_user.description,
        status="ACTIVE",
        internal_squad_uuids=[
            uuid.UUID(item.uuid) for item in provider_user.active_internal_squads
        ],
        external_squad_uuid=(
            uuid.UUID(provider_user.external_squad_uuid)
            if provider_user.external_squad_uuid is not None
            else None
        ),
    ).model_dump(mode="json")


__all__ = [
    "create_user_request",
    "matches_user_request",
    "normalize_provider_expiry",
    "normalize_utc",
    "profile_update_request",
    "provider_profile_snapshot",
]
