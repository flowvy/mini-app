"""FastAPI application factory."""

from __future__ import annotations

import asyncio
import secrets
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress

import structlog
from aiogram import Bot
from dishka import make_async_container
from dishka.integrations.aiogram import setup_dishka as setup_dishka_aiogram
from dishka.integrations.fastapi import setup_dishka
from fastapi import FastAPI, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from flowvy.api.middleware import MetricsMiddleware
from flowvy.api.routes.admin.commerce import router as admin_commerce_router
from flowvy.api.routes.admin.dashboard import router as admin_dashboard_router
from flowvy.api.routes.admin.registration import router as admin_registration_router
from flowvy.api.routes.admin.settings import router as admin_settings_router
from flowvy.api.routes.admin.support_articles import router as admin_support_articles_router
from flowvy.api.routes.admin.support_storage import router as admin_support_storage_router
from flowvy.api.routes.admin.users import router as admin_users_router
from flowvy.api.routes.debug import router as debug_router
from flowvy.api.routes.debug_admin import router as debug_admin_router
from flowvy.api.routes.debug_commerce import router as debug_commerce_router
from flowvy.api.routes.debug_support_articles import router as debug_support_articles_router
from flowvy.api.routes.debug_support_storage import router as debug_support_storage_router
from flowvy.api.routes.devices import router as devices_router
from flowvy.api.routes.health import router as health_router
from flowvy.api.routes.pulse import router as pulse_router
from flowvy.api.routes.registration import router as registration_router
from flowvy.api.routes.sponsor import router as sponsor_router
from flowvy.api.routes.subscription import router as subscription_router
from flowvy.api.routes.support_articles import router as support_articles_router
from flowvy.api.routes.support_requests import router as support_requests_router
from flowvy.api.routes.tribute_webhooks import router as tribute_webhooks_router
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
from flowvy.services.entitlement_executor import EntitlementExecutor, run_entitlement_executor
from flowvy.services.metrics_collector import run_metrics_collector
from flowvy.services.remnawave import RemnawaveClient
from flowvy.services.support_retention import SupportRetentionWorker, run_support_retention
from flowvy.services.webhook_retention import run_webhook_retention
from flowvy.telegram_main_app import TelegramMainApp, discover_main_app

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Manage webhook or local polling bot lifecycle and background workers."""
    settings = app.state.settings
    container = app.state.dishka_container
    polling_task: asyncio.Task[None] | None = None
    app.state.telegram_main_app = TelegramMainApp.unavailable()

    if settings.bot_token:
        bot = await container.get(Bot)
        app.state.telegram_main_app = await discover_main_app(bot)
        if app.state.telegram_main_app.status == "ready":
            logger.info("telegram_main_app_ready")
        elif app.state.telegram_main_app.status == "main_app_not_configured":
            logger.warning("telegram_main_app_not_configured")
        else:
            logger.warning("telegram_main_app_capability_unavailable")
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
        else:
            # Local development has no stable callback URL. Remove a stale
            # production webhook before polling so Telegram delivers updates here.
            await bot.delete_webhook(drop_pending_updates=False)
            polling_task = asyncio.create_task(
                dp.start_polling(
                    bot,
                    handle_signals=False,
                    close_bot_session=False,
                ),
            )
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
            settings.tribute_webhook_retention_days,
            settings.remnawave_webhook_cleanup_interval_seconds,
            settings.remnawave_webhook_cleanup_batch_size,
        ),
    )
    remnawave = await container.get(RemnawaveClient)
    entitlement_task = asyncio.create_task(
        run_entitlement_executor(
            EntitlementExecutor(sm, remnawave, settings),
            settings.tribute_entitlement_worker_interval_seconds,
        ),
    )
    support_retention_worker = await container.get(SupportRetentionWorker)
    support_retention_task = asyncio.create_task(
        run_support_retention(
            support_retention_worker,
            settings.support_retention_cleanup_interval_seconds,
        ),
    )

    try:
        yield
    finally:
        background_tasks = [
            metrics_task,
            webhook_retention_task,
            entitlement_task,
            support_retention_task,
        ]
        for task in background_tasks:
            task.cancel()
        for task in background_tasks:
            with suppress(asyncio.CancelledError):
                await task

        if polling_task is not None:
            polling_task.cancel()
            with suppress(asyncio.CancelledError):
                await polling_task
        elif hasattr(app.state, "dp"):
            await app.state.dp.emit_shutdown(bot=app.state.bot)
        if hasattr(app.state, "bot"):
            await app.state.bot.session.close()
        await container.close()


def create_app() -> FastAPI:
    """Build and configure the FastAPI application."""
    settings = Settings()
    app = FastAPI(title="Flowvy", version="0.1.0", lifespan=lifespan)
    app.state.settings = settings
    app.state.telegram_main_app = TelegramMainApp.unavailable()

    if settings.debug:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_methods=["*"],
            allow_headers=["*"],
        )

    if settings.allowed_hosts:
        app.add_middleware(
            TrustedHostMiddleware,
            allowed_hosts=settings.allowed_hosts,
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
    app.include_router(registration_router)
    app.include_router(subscription_router)
    app.include_router(sponsor_router)
    app.include_router(devices_router)
    app.include_router(pulse_router)
    app.include_router(support_articles_router)
    app.include_router(support_requests_router)
    app.include_router(admin_dashboard_router)
    app.include_router(admin_commerce_router)
    app.include_router(admin_registration_router)
    app.include_router(admin_settings_router)
    app.include_router(admin_support_articles_router)
    app.include_router(admin_support_storage_router)
    app.include_router(admin_users_router)
    app.include_router(webhooks_router)
    app.include_router(tribute_webhooks_router)
    if settings.debug:
        app.include_router(debug_router)
        app.include_router(debug_admin_router)
        app.include_router(debug_commerce_router)
        app.include_router(debug_support_articles_router)
        app.include_router(debug_support_storage_router)

    if settings.webhook_url:

        @app.post("/webhook", response_model=None)
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

    if settings.static_dir is not None:
        static_dir = settings.static_dir.resolve()
        index_file = static_dir / "index.html"
        assets_dir = static_dir / "assets"
        if not index_file.is_file() or not assets_dir.is_dir():
            msg = f"STATIC_DIR must contain index.html and assets/: {static_dir}"
            raise RuntimeError(msg)

        app.mount("/assets", StaticFiles(directory=assets_dir), name="frontend-assets")

        @app.get("/{full_path:path}", include_in_schema=False, response_model=None)
        async def frontend_route(full_path: str) -> FileResponse:
            """Serve the SPA shell without masking missing backend or webhook routes."""
            if full_path == "api" or full_path.startswith(("api/", "webhook")):
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
            return FileResponse(index_file)

    setup_dishka(container=container, app=app)
    app.add_middleware(MetricsMiddleware)
    return app
