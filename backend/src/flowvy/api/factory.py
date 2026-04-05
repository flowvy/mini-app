"""FastAPI application factory."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from dishka import make_async_container
from dishka.integrations.fastapi import setup_dishka
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from flowvy.api.routes.debug import router as debug_router
from flowvy.api.routes.health import router as health_router
from flowvy.api.routes.subscription import router as subscription_router
from flowvy.api.routes.users import router as users_router
from flowvy.bot.factory import create_bot, create_dispatcher
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
from flowvy.services.remnawave import RemnawaveClient


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Manage bot lifecycle: set webhook on start, cleanup on stop."""
    settings = app.state.settings

    if settings.bot_token:
        bot = create_bot(settings)
        dp = create_dispatcher()
        app.state.bot = bot
        app.state.dp = dp
        if settings.webhook_url:
            await bot.set_webhook(settings.webhook_url)
        await dp.emit_startup(bot=bot)

    container = app.state.dishka_container
    if settings.remnawave_url:
        remnawave = await container.get(RemnawaveClient)
        if not await remnawave.ping():
            msg = f"Remnawave unreachable at {settings.remnawave_url}"
            raise RuntimeError(msg)

    yield

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
    )

    app.include_router(health_router)
    app.include_router(users_router)
    app.include_router(subscription_router)
    app.include_router(debug_router)

    @app.post("/webhook")
    async def webhook(request: Request) -> Response:
        """Receive Telegram updates and feed to aiogram dispatcher."""
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
    return app
