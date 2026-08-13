"""Shared transport helpers for public webhook receivers."""

from __future__ import annotations

from fastapi import Request


async def read_limited_body(request: Request, limit: int) -> bytes | None:
    """Read at most ``limit`` bytes without trusting ``Content-Length`` alone."""
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            declared_size = int(content_length)
        except ValueError:
            return None
        if declared_size < 0 or declared_size > limit:
            return None

    body = bytearray()
    async for chunk in request.stream():
        if len(chunk) > limit - len(body):
            return None
        body.extend(chunk)
    return bytes(body)
