"""Provider-neutral commerce-rule contract and persistence tests."""

from __future__ import annotations

import datetime
import hashlib
import hmac
import json
import time
import uuid
from unittest.mock import AsyncMock
from urllib.parse import urlencode

import pytest
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from flowvy.api.factory import create_app
from flowvy.models.user import UserRole
from flowvy.repositories.access_profile import AccessProfileRepository
from flowvy.repositories.commerce_rule import CommerceRuleRepository
from flowvy.repositories.entitlement_operation import EntitlementOperationRepository
from flowvy.repositories.user import UserRepository
from flowvy.schemas.commerce import (
    AmountBand,
    CommerceRuleInput,
    CommerceRulePreviewRequest,
)
from flowvy.services.commerce import CommerceRuleError, CommerceRuleService

BOT_TOKEN = "000000:TEST"


def _admin_init_data(user_id: int) -> str:
    user = json.dumps(
        {"id": user_id, "first_name": "Test", "username": "admin"},
        separators=(",", ":"),
    )
    params = {"auth_date": str(int(time.time())), "user": user}
    check = "\n".join(f"{key}={value}" for key, value in sorted(params.items()))
    secret = hmac.new(b"WebAppData", BOT_TOKEN.encode(), hashlib.sha256)
    params["hash"] = hmac.new(secret.digest(), check.encode(), hashlib.sha256).hexdigest()
    return urlencode(params)


def _rule(**overrides: object) -> CommerceRuleInput:
    values: dict[str, object] = {
        "name": "Donation access",
        "commerce_type": "donation",
        "payment_mode": "any",
        "currency": "RUB",
        "calculation_type": "volume",
        "amount_bands": [
            AmountBand(from_amount_minor=50_000, unit_amount_minor=50_000, unit_days=30),
            AmountBand(from_amount_minor=350_000, unit_amount_minor=350_000, unit_days=365),
        ],
        "access_profile_id": uuid.uuid4(),
        "grant_mode": "extend",
        "priority": 100,
    }
    values.update(overrides)
    return CommerceRuleInput.model_validate(values)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("amount_minor", "expected_days"),
    [(50_000, 30), (100_000, 60), (350_000, 365), (400_000, 417)],
)
async def test_volume_preview_switches_whole_amount_ratio(
    amount_minor: int,
    expected_days: int,
) -> None:
    service = CommerceRuleService(AsyncMock(), AsyncMock())

    result = await service.preview(
        CommerceRulePreviewRequest(rule=_rule(), amount_minor=amount_minor),
    )

    assert result.matched is True
    assert result.duration_days == expected_days


@pytest.mark.asyncio
async def test_authenticated_preview_route_accepts_reported_camel_case_draft(
    engine: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    admin_id = 123_456
    monkeypatch.setenv("ADMIN_TELEGRAM_IDS", str(admin_id))
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        await UserRepository(session).create(
            id=admin_id,
            username="admin",
            full_name="Test Admin",
            role=UserRole.ADMIN,
        )
        await session.commit()

    app = create_app()
    payload = {
        "rule": {
            "provider": "tribute",
            "name": "1",
            "commerceType": "donation",
            "paymentMode": "any",
            "externalItemId": None,
            "currency": "RUB",
            "calculationType": "volume",
            "fixedDurationDays": None,
            "amountBands": [
                {
                    "fromAmountMinor": 50_000,
                    "unitAmountMinor": 349_900,
                    "unitDays": 30,
                },
            ],
            "accessProfileId": str(uuid.uuid4()),
            "grantMode": "extend",
            "priority": 100,
            "isEnabled": True,
        },
        "amountMinor": 50_000,
    }
    async with AsyncClient(
        transport=ASGITransport(app=app),  # type: ignore[arg-type]
        base_url="http://test",
    ) as client:
        response = await client.post(
            "/api/admin/commerce/preview",
            headers={"Authorization": f"tma {_admin_init_data(admin_id)}"},
            json=payload,
        )

    assert response.status_code == 200
    assert response.json() == {
        "matched": True,
        "durationDays": 4,
        "matchedBand": {
            "fromAmountMinor": 50_000,
            "unitAmountMinor": 349_900,
            "unitDays": 30,
        },
    }


@pytest.mark.asyncio
async def test_entitlement_journal_requires_admin_and_returns_only_allow_listed_fields(
    engine: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    admin_id = 123_457
    monkeypatch.setenv("ADMIN_TELEGRAM_IDS", str(admin_id))
    factory = async_sessionmaker(engine, expire_on_commit=False)
    created_at = datetime.datetime.now(datetime.UTC).replace(microsecond=0)
    async with factory() as session:
        await UserRepository(session).create(
            id=admin_id,
            username="admin",
            full_name="Test Admin",
            role=UserRole.ADMIN,
        )
        operation = await EntitlementOperationRepository(session).create(
            provider="tribute",
            semantic_key="donation:event:route-test",
            event_name="new_donation",
            operation_kind="grant",
            status="pending",
            provider_created_at=created_at,
            telegram_user_id=admin_id,
            transaction_id="must-not-be-returned",
            external_item_id="456",
            amount_minor=50_000,
            currency="RUB",
            duration_days=30,
            rule_snapshot={"private": "must-not-be-returned"},
            profile_snapshot={"private": "must-not-be-returned"},
        )
        operation_id = str(operation.id)
        await session.commit()

    app = create_app()
    async with AsyncClient(
        transport=ASGITransport(app=app),  # type: ignore[arg-type]
        base_url="http://test",
    ) as client:
        unauthorized = await client.get("/api/admin/commerce/operations")
        response = await client.get(
            "/api/admin/commerce/operations?limit=1",
            headers={"Authorization": f"tma {_admin_init_data(admin_id)}"},
        )

    assert unauthorized.status_code == 401
    assert response.status_code == 200
    payload = response.json()
    assert payload["hasMore"] is False
    assert payload["operations"] == [
        {
            "id": operation_id,
            "eventName": "new_donation",
            "operationKind": "grant",
            "status": "pending",
            "reasonCode": None,
            "providerCreatedAt": created_at.isoformat().replace("+00:00", "Z"),
            "telegramUserId": admin_id,
            "externalItemId": "456",
            "amountMinor": 50_000,
            "currency": "RUB",
            "durationDays": 30,
            "targetExpiry": None,
            "attemptCount": 0,
            "createdAt": payload["operations"][0]["createdAt"],
            "availableActions": [],
            "lastAction": None,
        },
    ]


@pytest.mark.asyncio
async def test_entitlement_action_route_requires_admin_and_returns_safe_transition(
    engine: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    admin_id = 123_458
    monkeypatch.setenv("ADMIN_TELEGRAM_IDS", str(admin_id))
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        await UserRepository(session).create(
            id=admin_id,
            username="admin",
            full_name="Test Admin",
            role=UserRole.ADMIN,
        )
        operation = await EntitlementOperationRepository(session).create(
            provider="tribute",
            semantic_key="donation:event:route-action-test",
            event_name="new_donation",
            operation_kind="grant",
            status="review",
            reason_code="provider_unavailable",
            provider_created_at=datetime.datetime.now(datetime.UTC),
            telegram_user_id=admin_id,
            user_id=admin_id,
            remnawave_user_id=42,
            external_item_id="456",
            amount_minor=50_000,
            currency="RUB",
            duration_days=30,
        )
        operation_id = str(operation.id)
        await session.commit()

    app = create_app()
    async with AsyncClient(
        transport=ASGITransport(app=app),  # type: ignore[arg-type]
        base_url="http://test",
    ) as client:
        unauthorized = await client.post(
            f"/api/admin/commerce/operations/{operation_id}/actions",
            json={"requestId": str(uuid.uuid4()), "action": "retry", "note": None},
        )
        response = await client.post(
            f"/api/admin/commerce/operations/{operation_id}/actions",
            headers={"Authorization": f"tma {_admin_init_data(admin_id)}"},
            json={"requestId": str(uuid.uuid4()), "action": "retry", "note": None},
        )
        conflict = await client.post(
            f"/api/admin/commerce/operations/{operation_id}/actions",
            headers={"Authorization": f"tma {_admin_init_data(admin_id)}"},
            json={
                "requestId": str(uuid.uuid4()),
                "action": "resolve",
                "note": "Too late for a different decision.",
            },
        )

    assert unauthorized.status_code == 401
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "retry"
    assert body["reasonCode"] == "operator_retry_queued"
    assert body["availableActions"] == []
    assert body["lastAction"]["action"] == "retry"
    assert body["lastAction"]["note"] is None
    assert "transactionId" not in body
    assert "actorTelegramId" not in body["lastAction"]
    assert conflict.status_code == 409


@pytest.mark.asyncio
async def test_preview_reports_below_threshold_without_side_effect() -> None:
    rules = AsyncMock()
    profiles = AsyncMock()
    service = CommerceRuleService(rules, profiles)

    result = await service.preview(
        CommerceRulePreviewRequest(rule=_rule(), amount_minor=49_999),
    )

    assert result.matched is False
    assert result.duration_days is None
    rules.create.assert_not_awaited()
    profiles.get_active.assert_not_awaited()


@pytest.mark.asyncio
async def test_fixed_preview_ignores_amount() -> None:
    service = CommerceRuleService(AsyncMock(), AsyncMock())
    payload = _rule(
        calculation_type="fixed",
        fixed_duration_days=45,
        amount_bands=[],
    )

    result = await service.preview(
        CommerceRulePreviewRequest(rule=payload, amount_minor=0),
    )

    assert result.matched is True
    assert result.duration_days == 45
    assert result.matched_band is None


def test_subscription_uses_provider_expiry_without_a_local_duration() -> None:
    payload = _rule(
        commerce_type="subscription",
        payment_mode="recurring",
        external_item_id="12",
        calculation_type="provider_expiry",
        fixed_duration_days=None,
        amount_bands=[],
        grant_mode="replace",
    )

    assert payload.calculation_type == "provider_expiry"
    assert payload.fixed_duration_days is None
    assert payload.amount_bands == []


@pytest.mark.parametrize("calculation_type", ["fixed", "volume"])
def test_subscription_rejects_local_duration_calculation(calculation_type: str) -> None:
    with pytest.raises(ValidationError, match="provider expiry"):
        _rule(
            commerce_type="subscription",
            payment_mode="recurring",
            external_item_id="12",
            calculation_type=calculation_type,
        )


@pytest.mark.parametrize(
    "overrides",
    [
        {"calculation_type": "fixed", "fixed_duration_days": None, "amount_bands": []},
        {"calculation_type": "volume", "fixed_duration_days": 30},
        {"commerce_type": "subscription", "payment_mode": "any", "external_item_id": "sub"},
        {"commerce_type": "unsupported", "payment_mode": "one_time"},
        {"commerce_type": "donation", "external_item_id": "not-allowed"},
        {"currency": "rubles"},
        {
            "amount_bands": [
                {"from_amount_minor": 50_000, "unit_amount_minor": 50_000, "unit_days": 30},
                {"from_amount_minor": 50_000, "unit_amount_minor": 1, "unit_days": 1},
            ],
        },
    ],
)
def test_rule_shape_fails_closed(overrides: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        _rule(**overrides)


def test_rule_normalizes_currency_and_band_order() -> None:
    payload = _rule(
        currency=" rub ",
        amount_bands=[
            {"from_amount_minor": 350_000, "unit_amount_minor": 350_000, "unit_days": 365},
            {"from_amount_minor": 50_000, "unit_amount_minor": 50_000, "unit_days": 30},
        ],
    )

    assert payload.currency == "RUB"
    assert [band.from_amount_minor for band in payload.amount_bands] == [50_000, 350_000]


async def _active_profile(session: AsyncSession) -> uuid.UUID:
    profile = await AccessProfileRepository(session).create(
        name="Paid access",
        validity_mode="duration",
        validity_days=30,
        traffic_limit_bytes=0,
        traffic_limit_strategy="NO_RESET",
        status="ACTIVE",
        internal_squad_uuids=[],
        is_active=True,
    )
    return profile.id


@pytest.mark.asyncio
async def test_rule_crud_persists_validated_calculator(session: AsyncSession) -> None:
    profile_id = await _active_profile(session)
    service = CommerceRuleService(
        CommerceRuleRepository(session),
        AccessProfileRepository(session),
    )

    created = await service.create_rule(_rule(access_profile_id=profile_id), admin_id=None)
    listed = await service.list_rules()
    updated = await service.update_rule(
        created.id,
        _rule(
            access_profile_id=profile_id,
            name="Annual donation rate",
            priority=10,
            is_enabled=False,
        ),
    )

    assert [item.id for item in listed] == [created.id]
    assert listed[0].amount_bands[1].unit_days == 365
    assert updated.name == "Annual donation rate"
    assert updated.priority == 10
    assert updated.is_enabled is False

    await service.delete_rule(created.id)
    assert await service.list_rules() == []


@pytest.mark.asyncio
async def test_inactive_profile_cannot_receive_automatic_rule(session: AsyncSession) -> None:
    profile_id = await _active_profile(session)
    profile = await AccessProfileRepository(session).get_by_id(profile_id)
    assert profile is not None
    await AccessProfileRepository(session).update(profile, is_active=False)
    service = CommerceRuleService(
        CommerceRuleRepository(session),
        AccessProfileRepository(session),
    )

    with pytest.raises(CommerceRuleError, match="Access profile is unavailable"):
        await service.create_rule(_rule(access_profile_id=profile_id), admin_id=None)

    assert await service.list_rules() == []
