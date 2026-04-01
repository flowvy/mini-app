"""Health check endpoint."""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    """Return service status and version."""
    return {"status": "ok", "version": "0.1.0"}
