"""Bot handler registration."""

from __future__ import annotations

from aiogram import Dispatcher

from flowvy.bot.handlers.start import router as start_router


def include_routers(dp: Dispatcher) -> None:
    """Register all bot routers on the dispatcher."""
    dp.include_router(start_router)
