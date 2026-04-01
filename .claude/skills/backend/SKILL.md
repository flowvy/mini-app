---
name: backend
description: Python backend development for Flowvy. Use when working on any file in backend/, including bot handlers, API routes, services, repositories, models, schemas, DI config, or migrations.
---

## Stack Versions

- Python 3.12+ with `from __future__ import annotations`
- aiogram 3.26+ (Bot API 9.5)
- FastAPI 0.115+
- SQLAlchemy 2.x async (asyncpg driver)
- Pydantic v2 (model_validator, field_validator)
- Dishka 1.x for dependency injection
- Redis via aioredis (or redis.asyncio)
- uv as package manager (`uv run`, `uv add`, `uv sync`)
- ruff for lint+format

## aiogram Patterns

Router-based handlers. Each feature has its own Router:
```python
from aiogram import Router
router = Router(name="subscriptions")

@router.message(Command("status"))
async def cmd_status(message: Message, user_service: UserService) -> None:
    """Show subscription status."""
    ...
```

Dependency injection: Dishka injects services via `@inject` decorator or auto_inject setup. Services are typed parameters in handler signatures.

FSM storage: Redis-backed. Use `state: FSMContext` parameter.

## aiogram + FastAPI Webhook Integration

No built-in adapter for FastAPI. Manual POST route with `feed_webhook_update`:
```python
@app.post("/webhook")
async def webhook(request: Request) -> Response:
    result = await dp.feed_webhook_update(bot=bot, update=await request.json())
    if result:
        return Response(content=result.model_dump_json(), media_type="application/json")
    return Response(status_code=200)
```

Lifespan: `bot.set_webhook()` + `dp.emit_startup()` on start, `dp.emit_shutdown()` + `bot.session.close()` on shutdown.

`bot/factory.py` creates Bot + Dispatcher only. No polling, no webhook setup there.

## FastAPI Patterns

All routes return Pydantic schemas. Use `Annotated` for dependency injection:
```python
from typing import Annotated
from fastapi import Depends

CurrentUser = Annotated[UserSchema, Depends(get_current_user)]

@router.get("/me")
async def get_me(user: CurrentUser) -> UserSchema:
    return user
```

initData validation: middleware extracts and validates Telegram WebApp initData from Authorization header. See `api/middleware/telegram_auth.py`.

## SQLAlchemy Patterns

Async session via `async_sessionmaker`. Models use `DeclarativeBase` with `Mapped[]` type annotations:
```python
class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    telegram_id: Mapped[int] = mapped_column(BigInteger, unique=True, index=True)
    username: Mapped[str | None]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
```

Repository pattern: each model has a repository class with async methods (get, get_by_tg_id, create, update, list). Base repository provides generic CRUD.

## Commands

```bash
cd backend
uv sync                          # install deps
uv run ruff check --fix .        # lint
uv run ruff format .             # format
uv run pytest                    # test
uv run alembic upgrade head      # apply migrations
uv run alembic revision --autogenerate -m "description"  # create migration
uv run python -m flowvy          # run dev server
```
