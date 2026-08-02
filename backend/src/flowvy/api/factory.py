"""FastAPI application factory."""

from __future__ import annotations

import asyncio
import secrets
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress

from aiogram import Bot
from dishka import make_async_container
from dishka.integrations.aiogram import setup_dishka as setup_dishka_aiogram
from dishka.integrations.fastapi import setup_dishka
from fastapi import FastAPI, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from flowvy.api.middleware import MetricsMiddleware
from flowvy.api.routes.admin.dashboard import router as admin_dashboard_router
from flowvy.api.routes.admin.settings import router as admin_settings_router
from flowvy.api.routes.admin.users import router as admin_users_router
from flowvy.api.routes.debug import router as debug_router
from flowvy.api.routes.debug_admin import router as debug_admin_router
from flowvy.api.routes.devices import router as devices_router
from flowvy.api.routes.health import router as health_router
from flowvy.api.routes.pulse import router as pulse_router
from flowvy.api.routes.subscription import router as subscription_router
from flowvy.api.routes.users import router as users_router
from flowvy.api.routes.webhooks import router as webhooks_router
from flowvy.bot.factory import create_dispatcher
from flowvy.config import Settings
from flowvy.di import (
    ConfigProvider,
    DatabaseProvider,
    HttpClientProvider,
    RedisProvider,
    RemnawaveProvider,
    RepositoryProvider,
    ServiceProvider,
)
from flowvy.di_bff import BffServiceProvider
from flowvy.di_bot import BotProvider
from flowvy.di_dashboard import DashboardProvider
from flowvy.di_webhooks import WebhooksProvider
from flowvy.services.metrics_collector import run_metrics_collector
from flowvy.services.remnawave import RemnawaveClient
from flowvy.services.webhook_retention import run_webhook_retention


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Manage bot lifecycle: set webhook on start, cleanup on stop."""
    settings = app.state.settings
    container = app.state.dishka_container

    if settings.bot_token:
        bot = await container.get(Bot)
        dp = create_dispatcher()
        app.state.bot = bot
        app.state.dp = dp
        setup_dishka_aiogram(container=container, router=dp)
        if settings.webhook_url:
            await bot.set_webhook(
                settings.webhook_url,
                secret_token=settings.telegram_webhook_secret,
            )
        await dp.emit_startup(bot=bot)
    if settings.remnawave_url:
        remnawave = await container.get(RemnawaveClient)
        if not await remnawave.ping():
            msg = f"Remnawave unreachable at {settings.remnawave_url}"
            raise RuntimeError(msg)

    redis = await container.get(Redis)
    app.state.metrics_redis = redis
    sm = await container.get(async_sessionmaker[AsyncSession])
    metrics_task = asyncio.create_task(
        run_metrics_collector(redis, sm, settings.metrics_snapshot_interval_seconds),
    )
    webhook_retention_task = asyncio.create_task(
        run_webhook_retention(
            sm,
            settings.remnawave_webhook_retention_days,
            settings.remnawave_webhook_cleanup_interval_seconds,
            settings.remnawave_webhook_cleanup_batch_size,
        ),
    )

    try:
        yield
    finally:
        for task in (metrics_task, webhook_retention_task):
            task.cancel()
        for task in (metrics_task, webhook_retention_task):
            with suppress(asyncio.CancelledError):
                await task

        if hasattr(app.state, "dp"):
            await app.state.dp.emit_shutdown(bot=app.state.bot)
            await app.state.bot.session.close()
        await container.close()


def create_app() -> FastAPI:
    """Build and configure the FastAPI application."""
    settings = Settings()
    app = FastAPI(title="Flowvy", version="0.1.0", lifespan=lifespan)
    app.state.settings = settings

    if settings.debug:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_methods=["*"],
            allow_headers=["*"],
        )

    container = make_async_container(
        ConfigProvider(),
        DatabaseProvider(),
        RepositoryProvider(),
        ServiceProvider(),
        RedisProvider(),
        HttpClientProvider(),
        RemnawaveProvider(),
        BffServiceProvider(),
        DashboardProvider(),
        WebhooksProvider(),
        BotProvider(),
    )

    app.include_router(health_router)
    app.include_router(users_router)
    app.include_router(subscription_router)
    app.include_router(devices_router)
    app.include_router(pulse_router)
    app.include_router(admin_dashboard_router)
    app.include_router(admin_settings_router)
    app.include_router(admin_users_router)
    app.include_router(webhooks_router)
    if settings.debug:
        app.include_router(debug_router)
        app.include_router(debug_admin_router)

    if settings.webhook_url:

        @app.post("/webhook")
        async def telegram_webhook(request: Request) -> Response:
            """Verify and dispatch a Telegram Bot API webhook update."""
            provided = request.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
            if not secrets.compare_digest(
                provided,
                settings.telegram_webhook_secret,
            ):
                return Response(status_code=status.HTTP_401_UNAUTHORIZED)
            if not hasattr(request.app.state, "dp") or not hasattr(
                request.app.state,
                "bot",
            ):
                return Response(status_code=status.HTTP_503_SERVICE_UNAVAILABLE)
            dp = request.app.state.dp
            bot = request.app.state.bot
            result = await dp.feed_webhook_update(bot=bot, update=await request.json())
            if result:
                return Response(
                    content=result.model_dump_json(),
                    media_type="application/json",
                )
            return Response(status_code=200)

    setup_dishka(container=container, app=app)
    app.add_middleware(MetricsMiddleware)
    return app
