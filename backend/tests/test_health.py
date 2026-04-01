"""Tests for health endpoint."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from flowvy.api.factory import create_app


@pytest.mark.asyncio
async def test_health_returns_ok() -> None:
    """GET /api/health returns status ok and version."""
    app = create_app()
    transport = ASGITransport(app=app)  # type: ignore[arg-type]
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/health")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["version"] == "0.1.0"
