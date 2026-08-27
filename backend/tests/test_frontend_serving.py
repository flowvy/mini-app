"""Tests for production same-origin frontend serving and host validation."""

from __future__ import annotations

from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError

from flowvy.api.factory import create_app
from flowvy.config import Settings


def _frontend_dist(tmp_path: Path) -> Path:
    assets = tmp_path / "assets"
    assets.mkdir()
    (tmp_path / "index.html").write_text("<main>Mini-App</main>", encoding="utf-8")
    (assets / "app.js").write_text("console.log('mini-app')", encoding="utf-8")
    return tmp_path


@pytest.mark.asyncio
async def test_static_frontend_serves_root_route_asset_and_client_route(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setenv("STATIC_DIR", str(_frontend_dist(tmp_path)))
    app = create_app()
    transport = ASGITransport(app=app)  # type: ignore[arg-type]

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        root = await client.get("/")
        client_route = await client.get("/support/article")
        asset = await client.get("/assets/app.js")
        missing_api = await client.get("/api/does-not-exist")

    assert root.status_code == 200
    assert root.text == "<main>Mini-App</main>"
    assert client_route.status_code == 200
    assert client_route.text == root.text
    assert asset.status_code == 200
    assert asset.text == "console.log('mini-app')"
    assert missing_api.status_code == 404
    assert missing_api.json() == {"detail": "Not Found"}


@pytest.mark.asyncio
async def test_production_host_allowlist_rejects_unknown_host(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setenv("STATIC_DIR", str(_frontend_dist(tmp_path)))
    monkeypatch.setenv("ALLOWED_HOSTS", "mini-app.example.com,localhost")
    app = create_app()
    transport = ASGITransport(app=app)  # type: ignore[arg-type]

    async with AsyncClient(transport=transport, base_url="http://unknown.example") as client:
        rejected = await client.get("/")
    async with AsyncClient(transport=transport, base_url="http://localhost") as client:
        accepted = await client.get("/")

    assert rejected.status_code == 400
    assert accepted.status_code == 200


def test_static_frontend_requires_complete_build(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setenv("STATIC_DIR", str(tmp_path))

    with pytest.raises(RuntimeError, match=r"index\.html and assets"):
        create_app()


def test_allowed_hosts_rejects_urls_and_ports() -> None:
    with pytest.raises(ValidationError, match="without scheme, path, or port"):
        Settings(_env_file=None, allowed_hosts="https://mini-app.example.com,localhost:8001")
