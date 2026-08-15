"""Regression tests for authentication and Telegram webhook boundaries."""

from __future__ import annotations

import asyncio
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from aiogram import Bot
from fastapi import FastAPI, HTTPException
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from flowvy.api.factory import create_app, lifespan
from flowvy.api.routes.admin.deps import get_current_admin
from flowvy.config import Settings
from flowvy.models.user import UserRole
from flowvy.repositories.user import UserRepository
from flowvy.services.remnawave import RemnawaveClient
from flowvy.services.user import InactiveUserError, UserService

from .test_auth import _build_init_data


def test_debug_is_disabled_by_default() -> None:
    settings = Settings(_env_file=None, bot_token="")
    assert settings.debug is False


def test_webhook_configuration_is_atomic() -> None:
    with pytest.raises(ValidationError):
        Settings(
            _env_file=None,
            bot_token="000000:TEST",
            webhook_url="https://example.test/webhook",
        )


@pytest.mark.parametrize("secret", ["short secret", "!" * 32, "a" * 257])
def test_webhook_secret_rejects_invalid_values(secret: str) -> None:
    with pytest.raises(ValidationError):
        Settings(
            _env_file=None,
            bot_token="000000:TEST",
            webhook_url="https://example.test/webhook",
            telegram_webhook_secret=secret,
        )


@pytest.mark.asyncio
async def test_debug_routes_are_absent_when_disabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DEBUG", "false")
    app = create_app()
    paths = {route.path for route in app.routes}
    assert not any(path.startswith("/api/debug") for path in paths)


@pytest.mark.asyncio
async def test_inactive_user_cannot_refresh_profile() -> None:
    repo = AsyncMock()
    repo.get_by_telegram_id = AsyncMock(
        return_value=SimpleNamespace(is_active=False),
    )
    service = UserService(repo, Settings(_env_file=None))

    with pytest.raises(InactiveUserError):
        await service.get_or_create(123, "disabled", "Disabled User")

    repo.update.assert_not_awaited()


@pytest.mark.asyncio
async def test_admin_requires_current_allowlist_membership() -> None:
    user = SimpleNamespace(is_active=True, role=UserRole.ADMIN)
    user_repo = AsyncMock()
    user_repo.get_by_telegram_id = AsyncMock(return_value=user)
    container = AsyncMock()
    container.get = AsyncMock(return_value=user_repo)
    request = SimpleNamespace(
        app=SimpleNamespace(
            state=SimpleNamespace(
                settings=Settings(_env_file=None, admin_telegram_ids=[]),
            ),
        ),
        state=SimpleNamespace(dishka_container=container),
    )
    init_data = SimpleNamespace(user=SimpleNamespace(id=123))

    with pytest.raises(HTTPException) as exc_info:
        await get_current_admin(request, init_data)

    assert exc_info.value.status_code == 403
    requested_type = container.get.await_args.args[0]
    assert requested_type is UserRepository


@pytest.mark.asyncio
async def test_blank_bot_token_fails_closed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BOT_TOKEN", "   ")
    app = create_app()
    transport = ASGITransport(app=app)  # type: ignore[arg-type]
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            "/api/me",
            headers={"Authorization": "tma anything"},
        )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_future_init_data_fails_closed() -> None:
    app = create_app()
    init_data = _build_init_data(auth_date=int(time.time()) + 3600)
    transport = ASGITransport(app=app)  # type: ignore[arg-type]
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get(
            "/api/me",
            headers={"Authorization": f"tma {init_data}"},
        )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_telegram_webhook_rejects_request_before_parsing_body(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("WEBHOOK_URL", "https://example.test/webhook")
    monkeypatch.setenv("TELEGRAM_WEBHOOK_SECRET", "valid_secret-token_1234567890")
    app = create_app()
    app.state.dp = AsyncMock()
    app.state.bot = AsyncMock()
    transport = ASGITransport(app=app)  # type: ignore[arg-type]
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/webhook",
            content=b"not-json",
            headers={"content-type": "application/json"},
        )
    assert response.status_code == 401
    app.state.dp.feed_webhook_update.assert_not_awaited()


@pytest.mark.asyncio
async def test_telegram_webhook_accepts_matching_secret(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    secret = "valid_secret-token_1234567890"
    monkeypatch.setenv("WEBHOOK_URL", "https://example.test/webhook")
    monkeypatch.setenv("TELEGRAM_WEBHOOK_SECRET", secret)
    app = create_app()
    app.state.dp = AsyncMock()
    app.state.dp.feed_webhook_update = AsyncMock(return_value=None)
    app.state.bot = AsyncMock()
    transport = ASGITransport(app=app)  # type: ignore[arg-type]
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/webhook",
            json={"update_id": 1},
            headers={"X-Telegram-Bot-Api-Secret-Token": secret},
        )
    assert response.status_code == 200
    app.state.dp.feed_webhook_update.assert_awaited_once()


@pytest.mark.asyncio
async def test_lifespan_registers_same_webhook_secret(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    secret = "valid_secret-token_1234567890"
    settings = Settings(
        _env_file=None,
        bot_token="000000:TEST",
        webhook_url="https://example.test/webhook",
        telegram_webhook_secret=secret,
    )
    bot = AsyncMock()
    bot.session.close = AsyncMock()
    dispatcher = AsyncMock()
    redis = AsyncMock()
    session_factory = AsyncMock(spec=async_sessionmaker)
    remnawave = AsyncMock()
    container = AsyncMock()
    container.get = AsyncMock(side_effect=[bot, redis, session_factory, remnawave])
    app = FastAPI()
    app.state.settings = settings
    app.state.dishka_container = container

    async def collector(*_args: object) -> None:
        await asyncio.Event().wait()

    monkeypatch.setattr("flowvy.api.factory.create_dispatcher", lambda: dispatcher)
    monkeypatch.setattr("flowvy.api.factory.setup_dishka_aiogram", lambda **_kwargs: None)
    monkeypatch.setattr("flowvy.api.factory.run_metrics_collector", collector)
    monkeypatch.setattr("flowvy.api.factory.run_webhook_retention", collector)
    monkeypatch.setattr("flowvy.api.factory.run_entitlement_executor", collector)

    async with lifespan(app):
        bot.set_webhook.assert_awaited_once_with(
            "https://example.test/webhook",
            secret_token=secret,
        )

    requested_types = [call.args[0] for call in container.get.await_args_list]
    assert requested_types[0] is Bot
    assert requested_types[1] is Redis
    assert requested_types[2] == async_sessionmaker[AsyncSession]
    assert requested_types[3] is RemnawaveClient


@pytest.mark.asyncio
async def test_lifespan_polls_locally_when_webhook_is_not_configured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = Settings(
        _env_file=None,
        bot_token="000000:TEST",
        webhook_url="",
        telegram_webhook_secret="",
    )
    bot = AsyncMock()
    bot.session.close = AsyncMock()
    dispatcher = AsyncMock()
    polling_started = asyncio.Event()

    async def poll(*_args: object, **_kwargs: object) -> None:
        polling_started.set()
        await asyncio.Event().wait()

    dispatcher.start_polling.side_effect = poll
    redis = AsyncMock()
    session_factory = AsyncMock(spec=async_sessionmaker)
    remnawave = AsyncMock()
    container = AsyncMock()
    container.get = AsyncMock(side_effect=[bot, redis, session_factory, remnawave])
    app = FastAPI()
    app.state.settings = settings
    app.state.dishka_container = container

    async def collector(*_args: object) -> None:
        await asyncio.Event().wait()

    monkeypatch.setattr("flowvy.api.factory.create_dispatcher", lambda: dispatcher)
    monkeypatch.setattr("flowvy.api.factory.setup_dishka_aiogram", lambda **_kwargs: None)
    monkeypatch.setattr("flowvy.api.factory.run_metrics_collector", collector)
    monkeypatch.setattr("flowvy.api.factory.run_webhook_retention", collector)
    monkeypatch.setattr("flowvy.api.factory.run_entitlement_executor", collector)

    async with lifespan(app):
        await asyncio.wait_for(polling_started.wait(), timeout=1)
        bot.delete_webhook.assert_awaited_once_with(drop_pending_updates=False)
        dispatcher.start_polling.assert_awaited_once_with(
            bot,
            handle_signals=False,
            close_bot_session=False,
        )
        dispatcher.emit_startup.assert_not_awaited()

    bot.session.close.assert_awaited_once()
