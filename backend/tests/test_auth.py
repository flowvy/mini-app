"""Tests for authentication flow: deps, service, GET /api/me."""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from unittest.mock import AsyncMock
from urllib.parse import urlencode

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from flowvy.api.factory import create_app
from flowvy.config import Settings
from flowvy.repositories.invite import InviteRepository
from flowvy.repositories.provider_settings import ProviderSettingsRepository
from flowvy.repositories.subscription import SubscriptionRepository
from flowvy.repositories.user import UserRepository
from flowvy.schemas.remnawave import RemnawaveUserData
from flowvy.services.registration import normalize_invite_code
from flowvy.services.remnawave import RemnawaveClient, RemnawaveError
from flowvy.services.user import UserService

BOT_TOKEN = "000000:TEST"


def _provider_user(telegram_id: int = 123456) -> RemnawaveUserData:
    return RemnawaveUserData.from_raw(
        {
            "id": 42,
            "shortUuid": "abc123",
            "username": f"tg_{telegram_id}",
            "status": "ACTIVE",
            "trafficLimitBytes": 10_000_000_000,
            "trafficLimitStrategy": "MONTH",
            "expireAt": "2026-09-01T00:00:00Z",
            "createdAt": "2025-01-01T00:00:00Z",
            "updatedAt": "2026-08-02T00:00:00Z",
            "subscriptionUrl": "https://panel.example.test/sub/abc123",
            "telegramId": telegram_id,
            "hwidDeviceLimit": 2,
            "userTraffic": {"usedTrafficBytes": 0, "lifetimeUsedTrafficBytes": 0},
        },
    )


def _build_init_data(
    user_id: int = 123456,
    first_name: str = "Test",
    last_name: str = "User",
    username: str = "testuser",
    auth_date: int | None = None,
    start_param: str | None = None,
) -> str:
    """Build a valid Telegram initData string signed with BOT_TOKEN."""
    if auth_date is None:
        auth_date = int(time.time())

    user_json = json.dumps(
        {
            "id": user_id,
            "first_name": first_name,
            "last_name": last_name,
            "username": username,
        },
        separators=(",", ":"),
    )

    params = {"auth_date": str(auth_date), "user": user_json}
    if start_param is not None:
        params["start_param"] = start_param
    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted(params.items()))

    secret = hmac.new(b"WebAppData", BOT_TOKEN.encode(), hashlib.sha256)
    h = hmac.new(
        secret.digest(),
        data_check_string.encode(),
        hashlib.sha256,
    ).hexdigest()

    params["hash"] = h
    return urlencode(params)


# --- UserService tests ---


class TestUserService:
    """UserService.get_or_create tests."""

    @pytest.mark.asyncio
    async def test_creates_new_user(self, session: AsyncSession) -> None:
        """First call creates a new user record."""
        repo = UserRepository(session)
        service = UserService(repo, Settings())

        user = await service.get_or_create(111, "alice", "Alice A")
        await session.commit()

        assert user.id == 111
        assert user.username == "alice"
        assert user.full_name == "Alice A"

    @pytest.mark.asyncio
    async def test_returns_existing_user(
        self,
        session: AsyncSession,
    ) -> None:
        """Second call returns existing user without creating duplicate."""
        repo = UserRepository(session)
        service = UserService(repo, Settings())

        first = await service.get_or_create(222, "bob", "Bob B")
        await session.commit()
        second = await service.get_or_create(222, "bob", "Bob B")

        assert first.id == second.id

    @pytest.mark.asyncio
    async def test_updates_changed_fields(
        self,
        session: AsyncSession,
    ) -> None:
        """Updates username/full_name when Telegram profile changes."""
        repo = UserRepository(session)
        service = UserService(repo, Settings())

        await service.get_or_create(333, "old_name", "Old Name")
        await session.commit()
        updated = await service.get_or_create(333, "new_name", "New Name")
        await session.commit()

        assert updated.username == "new_name"
        assert updated.full_name == "New Name"

    @pytest.mark.asyncio
    async def test_syncs_admin_role(self, session: AsyncSession) -> None:
        """Promotes user to ADMIN when telegram_id is in ADMIN_TELEGRAM_IDS."""
        repo = UserRepository(session)
        settings = Settings(admin_telegram_ids=[444])
        service = UserService(repo, settings)

        user = await service.get_or_create(444, "admin", "Admin A")
        await session.commit()

        assert user.role.value == "admin"

    @pytest.mark.asyncio
    async def test_demotes_removed_admin(self, session: AsyncSession) -> None:
        """Demotes user to USER when removed from ADMIN_TELEGRAM_IDS."""
        repo = UserRepository(session)
        admin_settings = Settings(admin_telegram_ids=[555])
        admin_service = UserService(repo, admin_settings)

        user = await admin_service.get_or_create(555, "ex", "Ex Admin")
        await session.commit()
        assert user.role.value == "admin"

        no_admin_settings = Settings(admin_telegram_ids=[])
        demote_service = UserService(repo, no_admin_settings)

        demoted = await demote_service.get_or_create(555, "ex", "Ex Admin")
        await session.commit()
        assert demoted.role.value == "user"


# --- GET /api/me integration tests ---


class TestGetMe:
    """Integration tests for GET /api/me."""

    @pytest.mark.asyncio
    async def test_unknown_user_registers_only_through_post(self, engine: AsyncEngine) -> None:
        """Profile reads do not create users; open registration uses an explicit POST."""
        app = create_app()
        transport = ASGITransport(app=app)  # type: ignore[arg-type]
        init_data = _build_init_data()

        async with AsyncClient(
            transport=transport,
            base_url="http://test",
        ) as client:
            profile = await client.get(
                "/api/me",
                headers={"Authorization": f"tma {init_data}"},
            )
            onboarding = await client.get(
                "/api/onboarding",
                headers={"Authorization": f"tma {init_data}"},
            )
            resp = await client.post(
                "/api/onboarding/register",
                headers={"Authorization": f"tma {init_data}"},
            )
            invite = await client.get(
                "/api/me/invite",
                headers={"Authorization": f"tma {init_data}"},
            )

        assert profile.status_code == 403
        assert profile.json()["detail"]["code"] == "registration_required"
        assert onboarding.status_code == 200
        assert onboarding.json()["state"] == "open"
        assert resp.status_code == 200
        body = resp.json()
        assert body["id"] == 123456
        assert body["username"] == "testuser"
        assert body["full_name"] == "Test User"
        assert body["role"] == "user"
        assert invite.status_code == 200
        assert invite.json()["code"].startswith("FVY-")
        assert invite.json()["invitedCount"] == 0
        assert invite.json()["referralUrl"] is None
        assert invite.json()["referralStatus"] == "telegram_unavailable"

    @pytest.mark.asyncio
    async def test_provider_only_user_is_imported_by_profile_read(
        self,
        engine: AsyncEngine,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """A trusted exact provider match bypasses invite policy without provider mutation."""
        monkeypatch.setenv("REMNAWAVE_URL", "https://panel.example.test")
        monkeypatch.setenv("REMNAWAVE_API_TOKEN", "test-token")
        lookup = AsyncMock(return_value=_provider_user())
        create = AsyncMock()
        monkeypatch.setattr(RemnawaveClient, "get_user_by_telegram_id", lookup)
        monkeypatch.setattr(RemnawaveClient, "create_user", create)
        app = create_app()
        transport = ASGITransport(app=app)  # type: ignore[arg-type]

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/api/me",
                headers={"Authorization": f"tma {_build_init_data()}"},
            )

        assert response.status_code == 200
        assert response.json()["id"] == 123456
        create.assert_not_awaited()
        async with async_sessionmaker(engine, expire_on_commit=False)() as session:
            imported = await UserRepository(session).get_by_telegram_id(123456)
            subscriptions = await SubscriptionRepository(session).get_by_user_id(123456)
            invite = await InviteRepository(session).get_by_owner(123456)
        assert imported is not None and imported.invited_by_id is None
        assert len(subscriptions) == 1
        assert subscriptions[0].remnawave_user_id == 42
        assert invite is not None

    @pytest.mark.asyncio
    async def test_signed_main_app_start_param_redeems_invite_without_request_body(
        self,
        engine: AsyncEngine,
    ) -> None:
        owner_id = 900001
        invite_code = "FVY23456789ABCDEFGHJKMN"
        async with async_sessionmaker(engine, expire_on_commit=False)() as session:
            owner = await UserRepository(session).create(
                id=owner_id,
                username="owner",
                full_name="Invite Owner",
            )
            await InviteRepository(session).create(
                code=normalize_invite_code(invite_code),
                created_by_id=owner.id,
            )
            await ProviderSettingsRepository(session).update_partial(
                {"registration_mode": "invite_only"},
            )
            await session.commit()

        app = create_app()
        transport = ASGITransport(app=app)  # type: ignore[arg-type]
        init_data = _build_init_data(
            user_id=654321,
            start_param=f"ref_{invite_code}",
        )
        headers = {"Authorization": f"tma {init_data}"}

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            onboarding = await client.get("/api/onboarding", headers=headers)
            redeemed = await client.post("/api/onboarding/redeem-launch", headers=headers)

        assert onboarding.status_code == 200
        assert onboarding.json()["launchInviteAvailable"] is True
        assert redeemed.status_code == 200
        assert redeemed.json()["id"] == 654321
        async with async_sessionmaker(engine, expire_on_commit=False)() as session:
            registered = await UserRepository(session).get_by_telegram_id(654321)
        assert registered is not None and registered.invited_by_id == owner_id

    @pytest.mark.asyncio
    async def test_missing_or_malformed_signed_start_param_cannot_auto_redeem(
        self,
        engine: AsyncEngine,
    ) -> None:
        app = create_app()
        transport = ASGITransport(app=app)  # type: ignore[arg-type]

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            for start_param in (None, "ref_FVY-2345-6789-ABCD-EFGH-JKMN", "other_value"):
                init_data = _build_init_data(start_param=start_param)
                headers = {"Authorization": f"tma {init_data}"}
                onboarding = await client.get("/api/onboarding", headers=headers)
                redeemed = await client.post("/api/onboarding/redeem-launch", headers=headers)

                assert onboarding.status_code == 200
                assert onboarding.json()["launchInviteAvailable"] is False
                assert redeemed.status_code == 400
                assert redeemed.json()["detail"]["code"] == "invalid_invite"

    @pytest.mark.asyncio
    async def test_provider_lookup_failure_is_temporarily_unavailable(
        self,
        engine: AsyncEngine,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """A provider outage must not misclassify an existing user as unregistered."""
        monkeypatch.setenv("REMNAWAVE_URL", "https://panel.example.test")
        monkeypatch.setenv("REMNAWAVE_API_TOKEN", "test-token")
        monkeypatch.setattr(
            RemnawaveClient,
            "get_user_by_telegram_id",
            AsyncMock(side_effect=RemnawaveError(502, "private upstream detail")),
        )
        app = create_app()
        transport = ASGITransport(app=app)  # type: ignore[arg-type]

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(
                "/api/me",
                headers={"Authorization": f"tma {_build_init_data()}"},
            )

        assert response.status_code == 503
        assert response.json()["detail"] == {
            "code": "registration_unavailable",
            "message": "Registration is temporarily unavailable",
        }
        assert "private upstream detail" not in response.text

    @pytest.mark.asyncio
    async def test_missing_auth_header_returns_401(self) -> None:
        """Request without Authorization header gets 401."""
        app = create_app()
        transport = ASGITransport(app=app)  # type: ignore[arg-type]

        async with AsyncClient(
            transport=transport,
            base_url="http://test",
        ) as client:
            resp = await client.get("/api/me")

        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_invalid_signature_returns_401(self) -> None:
        """Tampered initData gets 401."""
        app = create_app()
        transport = ASGITransport(app=app)  # type: ignore[arg-type]

        async with AsyncClient(
            transport=transport,
            base_url="http://test",
        ) as client:
            resp = await client.get(
                "/api/me",
                headers={"Authorization": "tma fake_data=1&hash=bad"},
            )

        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_expired_init_data_returns_401(self) -> None:
        """initData with old auth_date gets 401."""
        app = create_app()
        transport = ASGITransport(app=app)  # type: ignore[arg-type]
        old_time = int(time.time()) - 200_000
        init_data = _build_init_data(auth_date=old_time)

        async with AsyncClient(
            transport=transport,
            base_url="http://test",
        ) as client:
            resp = await client.get(
                "/api/me",
                headers={"Authorization": f"tma {init_data}"},
            )

        assert resp.status_code == 401
