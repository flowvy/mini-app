"""Production-boundary smoke for observed Tribute donation semantics."""

from __future__ import annotations

import datetime
import hashlib
import hmac
import json
import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from flowvy.api.factory import create_app
from flowvy.models.entitlement_operation import EntitlementOperation
from flowvy.models.subscription import Subscription
from flowvy.models.tribute_webhook_event import TributeWebhookEvent
from flowvy.repositories.access_profile import AccessProfileRepository
from flowvy.repositories.commerce_rule import CommerceRuleRepository
from flowvy.repositories.user import UserRepository
from flowvy.schemas.commerce import AmountBand, CommerceRuleInput
from flowvy.services.commerce import CommerceRuleService

_TRIBUTE_TEST_KEY = "fixture-only-donation-key"
_REGISTERED_USER_ID = 123_213_21
_UNKNOWN_USER_ID = 999_888_77
_DONATION_REQUEST_ID = 123


def _delivery(
    name: str,
    created_at: datetime.datetime,
    *,
    period: str,
    amount_minor: int,
    telegram_user_id: int | None = _REGISTERED_USER_ID,
    anonymously: bool = False,
) -> bytes:
    payload: dict[str, object] = {
        "donation_request_id": _DONATION_REQUEST_ID,
        "donation_name": "Fixture support",
        "period": period,
        "amount": amount_minor,
        "currency": "rub",
        "anonymously": anonymously,
        "web_app_link": "https://t.me/tribute/app?startapp=fixture",
    }
    if telegram_user_id is not None:
        payload.update(
            {
                "trb_user_id": "fixture-user",
                "telegram_user_id": telegram_user_id,
            },
        )
    return json.dumps(
        {
            "name": name,
            "created_at": created_at.isoformat().replace("+00:00", "Z"),
            "sent_at": (created_at + datetime.timedelta(milliseconds=200))
            .isoformat()
            .replace("+00:00", "Z"),
            "payload": payload,
        },
        separators=(",", ":"),
    ).encode()


async def _post_signed(client: AsyncClient, body: bytes) -> None:
    signature = hmac.new(
        _TRIBUTE_TEST_KEY.encode(),
        body,
        hashlib.sha256,
    ).hexdigest()
    response = await client.post(
        "/api/webhooks/tribute",
        content=body,
        headers={
            "content-type": "application/json",
            "trbt-signature": signature,
        },
    )
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def _seed_contract(
    factory: async_sessionmaker,
) -> tuple[uuid.UUID, uuid.UUID]:
    async with factory() as session:
        await UserRepository(session).create(
            id=_REGISTERED_USER_ID,
            username="fixture-user",
            full_name="Fixture User",
        )
        profile = await AccessProfileRepository(session).create(
            name="Fixture sponsor access",
            validity_mode="duration",
            validity_days=30,
            traffic_limit_bytes=0,
            traffic_limit_strategy="NO_RESET",
            hwid_device_limit=2,
            status="ACTIVE",
            internal_squad_uuids=[],
            is_active=True,
        )
        service = CommerceRuleService(
            CommerceRuleRepository(session),
            AccessProfileRepository(session),
        )
        bands = [
            AmountBand(
                from_amount_minor=50_000,
                unit_amount_minor=50_000,
                unit_days=30,
            ),
            AmountBand(
                from_amount_minor=350_000,
                unit_amount_minor=350_000,
                unit_days=365,
            ),
        ]
        one_time = await service.create_rule(
            CommerceRuleInput(
                name="Fixture one-time donation",
                commerce_type="donation",
                payment_mode="one_time",
                currency="RUB",
                calculation_type="volume",
                amount_bands=bands,
                access_profile_id=profile.id,
                grant_mode="extend",
                priority=100,
            ),
            admin_id=None,
        )
        recurring = await service.create_rule(
            CommerceRuleInput(
                name="Fixture recurring donation",
                commerce_type="donation",
                payment_mode="recurring",
                currency="RUB",
                calculation_type="volume",
                amount_bands=bands,
                access_profile_id=profile.id,
                grant_mode="extend",
                priority=200,
            ),
            admin_id=None,
        )
        await session.commit()
        return one_time.id, recurring.id


@pytest.mark.asyncio
async def test_signed_donation_matrix_plans_without_provider_mutation(
    engine: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Exercise HTTP, signature, inbox dedupe, rule selection, bands, and reviews."""
    monkeypatch.setenv("TRIBUTE_API_KEY", _TRIBUTE_TEST_KEY)
    monkeypatch.setenv("TRIBUTE_IDENTIFIED_DONATION_AUTOMATION_ENABLED", "true")
    monkeypatch.setenv("TRIBUTE_ENTITLEMENT_EXECUTION_ENABLED", "false")
    factory = async_sessionmaker(engine, expire_on_commit=False)
    one_time_rule_id, recurring_rule_id = await _seed_contract(factory)
    now = datetime.datetime.now(datetime.UTC).replace(microsecond=0)
    app = create_app()

    try:
        async with AsyncClient(
            transport=ASGITransport(app=app),  # type: ignore[arg-type]
            base_url="http://test",
        ) as client:
            one_time = _delivery(
                "new_donation",
                now,
                period="once",
                amount_minor=350_000,
            )
            await _post_signed(client, one_time)
            await _post_signed(client, one_time)
            await _post_signed(
                client,
                _delivery(
                    "new_donation",
                    now + datetime.timedelta(seconds=1),
                    period="monthly",
                    amount_minor=50_000,
                ),
            )
            await _post_signed(
                client,
                _delivery(
                    "recurrent_donation",
                    now + datetime.timedelta(seconds=2),
                    period="monthly",
                    amount_minor=50_000,
                ),
            )
            await _post_signed(
                client,
                _delivery(
                    "cancelled_donation",
                    now + datetime.timedelta(seconds=3),
                    period="monthly",
                    amount_minor=50_000,
                ),
            )
            await _post_signed(
                client,
                _delivery(
                    "new_donation",
                    now + datetime.timedelta(seconds=4),
                    period="once",
                    amount_minor=50_000,
                    telegram_user_id=None,
                    anonymously=True,
                ),
            )
            await _post_signed(
                client,
                _delivery(
                    "new_donation",
                    now + datetime.timedelta(seconds=5),
                    period="once",
                    amount_minor=50_000,
                    telegram_user_id=_UNKNOWN_USER_ID,
                ),
            )

        async with factory() as session:
            deliveries = list(
                (
                    await session.scalars(
                        select(TributeWebhookEvent).order_by(
                            TributeWebhookEvent.provider_created_at,
                        ),
                    )
                ).all(),
            )
            operations = list(
                (
                    await session.scalars(
                        select(EntitlementOperation).order_by(
                            EntitlementOperation.provider_created_at,
                        ),
                    )
                ).all(),
            )
            provider_links = await session.scalar(
                select(func.count()).select_from(Subscription),
            )
            unknown_user = await UserRepository(session).get_by_id(_UNKNOWN_USER_ID)
    finally:
        await app.state.dishka_container.close()

    assert len(deliveries) == 6
    assert [event.payment_mode for event in deliveries[:3]] == [
        "one_time",
        "recurring",
        "recurring",
    ]
    assert [event.provider_period for event in deliveries[:3]] == [None, "monthly", "monthly"]
    assert len(operations) == 6

    one_time_operation = operations[0]
    first_recurring_operation = operations[1]
    renewal_operation = operations[2]
    cancellation_operation = operations[3]
    anonymous_operation = operations[4]
    unknown_user_operation = operations[5]

    assert one_time_operation.status == "pending"
    assert one_time_operation.rule_id == one_time_rule_id
    assert one_time_operation.duration_days == 365
    assert first_recurring_operation.status == "pending"
    assert first_recurring_operation.rule_id == recurring_rule_id
    assert first_recurring_operation.duration_days == 30
    assert renewal_operation.status == "pending"
    assert renewal_operation.rule_id == recurring_rule_id
    assert renewal_operation.duration_days == 30
    assert cancellation_operation.operation_kind == "review"
    assert cancellation_operation.status == "resolved"
    assert cancellation_operation.reason_code == "cancellation_is_not_refund"
    assert (
        len(
            {
                one_time_operation.semantic_key,
                first_recurring_operation.semantic_key,
                renewal_operation.semantic_key,
            },
        )
        == 3
    )
    assert anonymous_operation.status == "review"
    assert anonymous_operation.reason_code == "anonymous_donation"
    assert unknown_user_operation.status == "review"
    assert unknown_user_operation.reason_code == "user_not_found"
    assert provider_links == 0
    assert unknown_user is None
