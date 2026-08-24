"""Support knowledge-base validation, persistence and authenticated HTTP contracts."""

from __future__ import annotations

import hashlib
import hmac
import json
import time
import uuid
from urllib.parse import urlencode

import pytest
from httpx import ASGITransport, AsyncClient
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from flowvy.api.factory import create_app
from flowvy.models.user import UserRole
from flowvy.repositories.provider_settings import ProviderSettingsRepository
from flowvy.repositories.support_article import SupportArticleRepository
from flowvy.repositories.user import UserRepository
from flowvy.schemas.support_articles import SupportArticleInput, SupportArticleLocale
from flowvy.services.support_articles import (
    SupportArticleNotFoundError,
    SupportArticleOrderError,
    SupportArticlePublicationError,
    SupportArticleService,
)

BOT_TOKEN = "000000:TEST"


def _init_data(user_id: int, *, username: str = "user") -> str:
    user = json.dumps(
        {"id": user_id, "first_name": "Test", "username": username},
        separators=(",", ":"),
    )
    params = {"auth_date": str(int(time.time())), "user": user}
    check = "\n".join(f"{key}={value}" for key, value in sorted(params.items()))
    secret = hmac.new(b"WebAppData", BOT_TOKEN.encode(), hashlib.sha256)
    params["hash"] = hmac.new(secret.digest(), check.encode(), hashlib.sha256).hexdigest()
    return urlencode(params)


def _payload(
    *,
    title: str = "Connection does not work",
    status: str = "draft",
) -> SupportArticleInput:
    return SupportArticleInput.model_validate(
        {
            "topic": "connection",
            "status": status,
            "contentLocales": {
                "en": {
                    "title": title,
                    "summary": "Check the common causes first",
                    "body": "Try **refreshing** the profile.\n\n1. Open the client\n2. Reconnect",
                }
            },
        }
    )


def test_article_locale_normalizes_commonmark_and_rejects_unsafe_source() -> None:
    content = SupportArticleLocale(
        title="  Connection   problem ",
        summary="  Check   this first ",
        body=" **Refresh**\r\n\r\n- Reconnect ",
    )

    assert content.title == "Connection problem"
    assert content.summary == "Check this first"
    assert content.body == "**Refresh**\n\n- Reconnect"

    for raw_html in ("<script>alert(1)</script>", "<!-- hidden -->"):
        with pytest.raises(ValidationError, match="raw HTML"):
            SupportArticleLocale(body=raw_html)
    with pytest.raises(ValidationError, match="HTTP or HTTPS"):
        SupportArticleLocale(body="[Open](javascript:alert)")


@pytest.mark.asyncio
async def test_article_service_enforces_publication_and_published_only_projection(
    session: AsyncSession,
) -> None:
    articles = SupportArticleRepository(session)
    settings = ProviderSettingsRepository(session)
    service = SupportArticleService(articles, settings)

    with pytest.raises(SupportArticlePublicationError, match="default locale"):
        await service.create(
            SupportArticleInput(
                topic="other",
                status="published",
                content_locales={"en": SupportArticleLocale(title="Incomplete")},
            ),
            admin_id=None,
        )

    draft = await service.create(_payload(), admin_id=None)
    assert await service.list_public("en") == []

    published = await service.update(draft.id, _payload(status="published"))
    public = await service.list_public("en-US")
    assert published.status == "published"
    assert len(public) == 1
    assert public[0].id == draft.id
    assert public[0].title == "Connection does not work"
    assert public[0].body.startswith("Try **refreshing**")

    await service.update(draft.id, _payload(status="archived"))
    assert await service.list_public("en") == []

    await service.delete(draft.id)
    assert await service.list_admin() == []
    with pytest.raises(SupportArticleNotFoundError, match="was not found"):
        await service.delete(draft.id)


@pytest.mark.asyncio
async def test_article_service_reorders_only_the_complete_current_collection(
    session: AsyncSession,
) -> None:
    service = SupportArticleService(
        SupportArticleRepository(session),
        ProviderSettingsRepository(session),
    )
    first = await service.create(_payload(title="First"), admin_id=None)
    second = await service.create(_payload(title="Second"), admin_id=None)

    ordered = await service.reorder([second.id, first.id])
    assert [article.id for article in ordered] == [second.id, first.id]
    assert [article.sort_order for article in ordered] == [10, 20]

    with pytest.raises(SupportArticleOrderError, match="current collection"):
        await service.reorder([first.id, uuid.uuid4()])


@pytest.mark.asyncio
async def test_support_article_routes_require_roles_and_hide_non_published_articles(
    engine: AsyncEngine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    admin_id = 320_001
    user_id = 320_002
    monkeypatch.setenv("ADMIN_TELEGRAM_IDS", str(admin_id))
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        users = UserRepository(session)
        await users.create(
            id=admin_id,
            username="admin",
            full_name="Admin",
            role=UserRole.ADMIN,
        )
        await users.create(
            id=user_id,
            username="user",
            full_name="User",
            role=UserRole.USER,
        )
        await session.commit()

    app = create_app()
    admin_headers = {"Authorization": f"tma {_init_data(admin_id, username='admin')}"}
    user_headers = {
        "Authorization": f"tma {_init_data(user_id)}",
        "Accept-Language": "en-US,en;q=0.9",
    }
    payload = _payload(status="published").model_dump(mode="json", by_alias=True)
    async with AsyncClient(
        transport=ASGITransport(app=app),  # type: ignore[arg-type]
        base_url="http://test",
    ) as client:
        assert (await client.get("/api/admin/support/articles")).status_code == 401
        denied = await client.get(
            "/api/admin/support/articles",
            headers={"Authorization": f"tma {_init_data(user_id)}"},
        )
        created = await client.post(
            "/api/admin/support/articles",
            headers=admin_headers,
            json=payload,
        )
        public_list = await client.get("/api/support/articles", headers=user_headers)
        article_id = created.json()["id"]
        public_detail = await client.get(
            f"/api/support/articles/{article_id}",
            headers=user_headers,
        )
        reordered = await client.put(
            "/api/admin/support/articles/order/all",
            headers=admin_headers,
            json={"articleIds": [article_id]},
        )
        archived_payload = {**payload, "status": "archived"}
        archived = await client.put(
            f"/api/admin/support/articles/{article_id}",
            headers=admin_headers,
            json=archived_payload,
        )
        hidden = await client.get(
            f"/api/support/articles/{article_id}",
            headers=user_headers,
        )
        delete_denied = await client.delete(
            f"/api/admin/support/articles/{article_id}",
            headers={"Authorization": f"tma {_init_data(user_id)}"},
        )
        deleted = await client.delete(
            f"/api/admin/support/articles/{article_id}",
            headers=admin_headers,
        )
        missing_admin = await client.get(
            f"/api/admin/support/articles/{article_id}",
            headers=admin_headers,
        )
        deleted_again = await client.delete(
            f"/api/admin/support/articles/{article_id}",
            headers=admin_headers,
        )

    assert denied.status_code == 403
    assert created.status_code == 201
    assert public_list.status_code == 200
    assert [article["id"] for article in public_list.json()["articles"]] == [article_id]
    assert public_detail.status_code == 200
    assert public_detail.json()["title"] == "Connection does not work"
    assert "contentLocales" not in public_detail.json()
    assert reordered.status_code == 200
    assert [article["id"] for article in reordered.json()["articles"]] == [article_id]
    assert archived.status_code == 200
    assert hidden.status_code == 404
    assert delete_denied.status_code == 403
    assert deleted.status_code == 204
    assert deleted.content == b""
    assert missing_admin.status_code == 404
    assert deleted_again.status_code == 404
