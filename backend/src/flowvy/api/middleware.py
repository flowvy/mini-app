"""Request metrics middleware."""

from __future__ import annotations

from datetime import UTC, datetime

from redis.asyncio import Redis
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response


class MetricsMiddleware(BaseHTTPMiddleware):
    """Increment Redis request counters on every HTTP request."""

    async def dispatch(
        self,
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> Response:
        """Count request via Dishka container, then pass through."""
        if hasattr(request.state, "dishka_container"):
            redis: Redis = await request.state.dishka_container.get(Redis)
            today = datetime.now(UTC).strftime("%Y-%m-%d")
            pipe = redis.pipeline(transaction=False)
            pipe.incr("bot:requests:total")
            pipe.incr(f"bot:requests:{today}")
            await pipe.execute()

        return await call_next(request)
