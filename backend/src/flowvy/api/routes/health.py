"""Health check endpoint."""

from __future__ import annotations

import asyncio

from dishka.integrations.fastapi import DishkaRoute, FromDishka
from fastapi import APIRouter, Request, status
from fastapi.responses import JSONResponse
from redis.asyncio import Redis
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(prefix="/api", tags=["health"], route_class=DishkaRoute)
READINESS_TIMEOUT_SECONDS = 2.0


@router.get("/health")
async def health(request: Request) -> dict[str, str]:
    """Return process liveness without touching external dependencies."""
    return {"status": "ok", "version": request.app.state.settings.version}


async def _postgres_ready(session: AsyncSession) -> bool:
    try:
        await asyncio.wait_for(
            session.execute(text("SELECT 1")),
            timeout=READINESS_TIMEOUT_SECONDS,
        )
    except asyncio.CancelledError:
        raise
    except Exception:
        return False
    return True


async def _redis_ready(redis: Redis) -> bool:
    try:
        return bool(
            await asyncio.wait_for(
                redis.ping(),
                timeout=READINESS_TIMEOUT_SECONDS,
            )
        )
    except asyncio.CancelledError:
        raise
    except Exception:
        return False


@router.get("/ready")
async def readiness(
    session: FromDishka[AsyncSession] = None,  # type: ignore[assignment]
    redis: FromDishka[Redis] = None,  # type: ignore[assignment]
) -> JSONResponse:
    """Report PostgreSQL and Redis readiness without leaking error details."""
    postgres_ok, redis_ok = await asyncio.gather(
        _postgres_ready(session),
        _redis_ready(redis),
    )
    ready = postgres_ok and redis_ok
    return JSONResponse(
        status_code=status.HTTP_200_OK if ready else status.HTTP_503_SERVICE_UNAVAILABLE,
        content={
            "status": "ready" if ready else "not_ready",
            "checks": {
                "postgres": "ok" if postgres_ok else "error",
                "redis": "ok" if redis_ok else "error",
            },
        },
    )
