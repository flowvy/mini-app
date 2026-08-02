"""Request metrics middleware."""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from redis.asyncio import Redis
from redis.exceptions import RedisError
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger(__name__)
DAILY_COUNTER_RETENTION_SECONDS = 90 * 24 * 60 * 60


class MetricsMiddleware(BaseHTTPMiddleware):
    """Increment Redis request counters on every HTTP request."""

    async def dispatch(
        self,
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> Response:
        """Count a request without making availability depend on metrics."""
        redis: Redis | None = getattr(request.app.state, "metrics_redis", None)
        if redis is not None:
            today = datetime.now(UTC).strftime("%Y-%m-%d")
            daily_key = f"bot:requests:{today}"
            try:
                pipe = redis.pipeline(transaction=False)
                pipe.incr("bot:requests:total")
                pipe.incr(daily_key)
                pipe.expire(daily_key, DAILY_COUNTER_RETENTION_SECONDS)
                await pipe.execute()
            except RedisError:
                logger.warning("request_metrics_redis_unavailable", exc_info=True)

        return await call_next(request)
