"""Production-boundary smoke for one Tribute digital-product lifecycle."""

from __future__ import annotations

import datetime
import hashlib
import hmac
import json

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from flowvy.api.factory import create_app
from flowvy.config import Settings
from flowvy.models.entitlement_operation import EntitlementOperation
from flowvy.models.tribute_webhook_event import TributeWebhookEvent
from flowvy.repositories.access_profile import AccessProfileRepository
from flowvy.repositories.commerce_rule import CommerceRuleRepository
from flowvy.repositories.subscription import SubscriptionRepository
from flowvy.repositories.user import UserRepository
from flowvy.schemas.commerce import CommerceRuleInput
from flowvy.schemas.remnawave import RemnawaveUpdateUserRequest, RemnawaveUserData
from flowvy.services.commerce import CommerceRuleService
from flowvy.services.entitlement_executor import EntitlementExecutor

_TRIBUTE_TEST_KEY = "fixture-only-tribute-key"
_TELEGRAM_USER_ID = 123_213_21
_REMNAWAVE_USER_ID = 42
_PURCHASE_ID = 78_901
_PRODUCT_ID = 456


def _settings() -> Settings:
    return Settings(
        _env_file=None,
        remnawave_url="https://panel.invalid",
        remnawave_api_token="fixture-only-provider-key",
        tribute_entitlement_execution_enabled=True,
        tribute_entitlement_worker_interval_seconds=1,
        tribute_entitlement_lease_seconds=30,
        tribute_entitlement_max_attempts=3,
    )


def _provider_user(expiry: datetime.datetime) -> RemnawaveUserData:
    return RemnawaveUserData.from_raw(
        {
            "id": _REMNAWAVE_USER_ID,
            "uuid": "550e8400-e29b-41d4-a716-446655440000",
            "shortUuid": "fixture-subscription",
            "username": "fixture-user",
            "status": "ACTIVE",
            "trafficLimitBytes": 0,
            "trafficLimitStrategy": "NO_RESET",
            "expireAt": expiry.isoformat(),
            "createdAt": "2026-01-01T00:00:00Z",
            "updatedAt": "2026-08-01T00:00:00Z",
            "telegramId": _TELEGRAM_USER_ID,
            "hwidDeviceLimit": 2,
            "subscriptionUrl": "https://panel.invalid/sub/fixture",
            "activeInternalSquads": [],
            "userTraffic": {
                "usedTrafficBytes": 0,
                "lifetimeUsedTrafficBytes": 0,
            },
        },
    )


class _StatefulRemnawave:
    """Test double that exposes the same absolute-expiry boundary as the client."""

    def __init__(self, expiry: datetime.datetime) -> None:
        self.current = _provider_user(expiry)
        self.update_requests: list[RemnawaveUpdateUserRequest] = []

    async def get_user_by_id(self, user_id: int) -> RemnawaveUserData:
        assert user_id == _REMNAWAVE_USER_ID
        return self.current

    async def update_user_access(
        self,
        user: RemnawaveUserData,
        request: RemnawaveUpdateUserRequest,
    ) -> RemnawaveUserData:
        assert user.provider_id == _REMNAWAVE_USER_ID
        self.update_requests.append(request)
        updates: dict[str, object] = {"expire_at": request.expire_at}
        if request.status is not None:
            updates["status"] = request.status
        if request.traffic_limit_bytes is not None:
            updates["traffic_limit_bytes"] = request.traffic_limit_bytes
        if request.traffic_limit_strategy is not None:
            updates["traffic_limit_strategy"] = request.traffic_limit_strategy
        if request.hwid_device_limit is not None:
            updates["hwid_device_limit"] = request.hwid_device_limit
        self.current = self.current.model_copy(update=updates)
        return self.current


def _delivery(
    name: str,
    sent_at: datetime.datetime,
) -> bytes:
    payload: dict[str, object] = {
        "product_id": _PRODUCT_ID,
        "product_name": "Fixture access",
        "amount": 500,
        "currency": "rub",
        "trb_user_id": "fixture-user",
        "telegram_user_id": _TELEGRAM_USER_ID,
        "telegram_username": "fixture-user",
        "purchase_id": _PURCHASE_ID,
        "transaction_id": 234_567,
    }
    if name == "new_digital_product":
        payload["purchase_created_at"] = (
            (sent_at - datetime.timedelta(seconds=2)).isoformat().replace("+00:00", "Z")
        )
    else:
        payload["refund_reason"] = "telegram_refund"
        payload["refunded_at"] = sent_at.isoformat().replace("+00:00", "Z")
    return json.dumps(
        {
            "name": name,
            "created_at": (sent_at - datetime.timedelta(seconds=1))
            .isoformat()
            .replace("+00:00", "Z"),
            "sent_at": sent_at.isoformat().replace("+00:00", "Z"),
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


async def _seed_contract(factory: async_sessionmaker, initial_expiry: datetime.datetime) -> None:
    async with factory() as session:
        await UserRepository(session).create(
            id=_TELEGRAM_USER_ID,
            username="fixture-user",
            full_name="Fixture User",
        )
        await SubscriptionRepository(session).create(
            user_id=_TELEGRAM_USER_ID,
            remnawave_user_id=_REMNAWAVE_USER_ID,
            status="active",
            device_limit=2,
            expires_at=initial_expiry.replace(tzinfo=None),
        )
        profile = await AccessProfileRepository(session).create(
            name="Fixture paid access",
            validity_mode="duration",
            validity_days=30,
            traffic_limit_bytes=0,
            traffic_limit_strategy="NO_RESET",
            hwid_device_limit=2,
            status="ACTIVE",
            internal_squad_uuids=[],
            is_active=True,
        )
        await CommerceRuleService(
            CommerceRuleRepository(session),
            AccessProfileRepository(session),
        ).create_rule(
            CommerceRuleInput(
                name="Fixture digital product",
                commerce_type="digital_product",
                payment_mode="one_time",
                external_item_id=str(_PRODUCT_ID),
                currency="RUB",
                calculation_type="fixed",
                fixed_duration_days=30,
                access_profile_id=profile.id,
                grant_mode="extend",
            ),
            admin_id=None,
        )
        await session.commit()


@pytest.mark.asyncio
async def test_signed_purchase_duplicate_apply_and_refund_compensation(
    engine: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Exercise the real HTTP-to-ledger path and a stateful fake provider."""
    monkeypatch.setenv("TRIBUTE_API_KEY", _TRIBUTE_TEST_KEY)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    now = datetime.datetime.now(datetime.UTC).replace(microsecond=0)
    initial_expiry = now + datetime.timedelta(days=10)
    await _seed_contract(factory, initial_expiry)
    app = create_app()

    try:
        async with AsyncClient(
            transport=ASGITransport(app=app),  # type: ignore[arg-type]
            base_url="http://test",
        ) as client:
            purchase = _delivery("new_digital_product", now)
            await _post_signed(client, purchase)
            await _post_signed(client, purchase)

            async with factory() as session:
                operations = list(
                    (
                        await session.scalars(
                            select(EntitlementOperation).order_by(
                                EntitlementOperation.created_at,
                            ),
                        )
                    ).all(),
                )
                deliveries = await session.scalar(
                    select(func.count()).select_from(TributeWebhookEvent),
                )
            assert deliveries == 1
            assert len(operations) == 1
            grant = operations[0]
            assert grant.semantic_key == f"digital_product:purchase:{_PURCHASE_ID}"
            assert grant.status == "pending"

            provider = _StatefulRemnawave(initial_expiry)
            executor = EntitlementExecutor(factory, provider, _settings())  # type: ignore[arg-type]
            assert await executor.process_next() is True
            assert await executor.process_next() is False

            expected_grant_expiry = initial_expiry + datetime.timedelta(days=30)
            assert provider.current.expire_at == expected_grant_expiry
            assert len(provider.update_requests) == 1
            assert provider.update_requests[0].expire_at == expected_grant_expiry

            refund = _delivery(
                "digital_product_refunded",
                now + datetime.timedelta(seconds=5),
            )
            await _post_signed(client, refund)
            await _post_signed(client, refund)

            assert await executor.process_next() is True
            assert await executor.process_next() is False

        async with factory() as session:
            operations = list(
                (
                    await session.scalars(
                        select(EntitlementOperation).order_by(
                            EntitlementOperation.created_at,
                        ),
                    )
                ).all(),
            )
            deliveries = await session.scalar(
                select(func.count()).select_from(TributeWebhookEvent),
            )
            subscription = await SubscriptionRepository(session).get_by_remnawave_user_id(
                _REMNAWAVE_USER_ID,
            )
    finally:
        await app.state.dishka_container.close()

    assert deliveries == 2
    assert len(operations) == 2
    grant, refund_operation = operations
    assert grant.status == "applied"
    assert grant.base_expiry == initial_expiry
    assert grant.target_expiry == expected_grant_expiry
    assert refund_operation.semantic_key == f"digital_product:refund:{_PURCHASE_ID}"
    assert refund_operation.root_operation_id == grant.id
    assert refund_operation.status == "applied"
    assert refund_operation.target_expiry == initial_expiry
    assert provider.current.expire_at == initial_expiry
    assert len(provider.update_requests) == 2
    assert provider.update_requests[1].expire_at == initial_expiry
    assert subscription is not None
    assert subscription.expires_at == initial_expiry.replace(tzinfo=None)
