"""Tests for authentication flow: deps, service, GET /api/me."""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from urllib.parse import urlencode

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession

from flowvy.api.factory import create_app
from flowvy.config import Settings
from flowvy.repositories.user import UserRepository
from flowvy.services.user import UserService

BOT_TOKEN = "000000:TEST"


def _build_init_data(
    user_id: int = 123456,
    first_name: str = "Test",
    last_name: str = "User",
    username: str = "testuser",
    auth_date: int | None = None,
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
    async def test_valid_init_data_returns_user(self, engine: AsyncEngine) -> None:
        """Valid initData returns 200 with user data."""
        app = create_app()
        transport = ASGITransport(app=app)  # type: ignore[arg-type]
        init_data = _build_init_data()

        async with AsyncClient(
            transport=transport,
            base_url="http://test",
        ) as client:
            resp = await client.get(
                "/api/me",
                headers={"Authorization": f"tma {init_data}"},
            )

        assert resp.status_code == 200
        body = resp.json()
        assert body["id"] == 123456
        assert body["username"] == "testuser"
        assert body["full_name"] == "Test User"
        assert body["role"] == "user"

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
