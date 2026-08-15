"""Normalized admin catalog mapping without real Tribute network calls."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient

from flowvy.api.factory import create_app
from flowvy.api.routes.admin.commerce import get_commerce_catalog
from flowvy.schemas.tribute import TributeCatalog
from flowvy.services.commerce_catalog import (
    CommerceCatalogService,
    CommerceCatalogUnavailableError,
)
from flowvy.services.tribute import TributeError


@pytest.mark.asyncio
async def test_catalog_maps_only_allow_listed_rule_editor_fields() -> None:
    tribute = AsyncMock()
    tribute.get_catalog.return_value = TributeCatalog.model_validate(
        {
            "subscriptions": [
                {
                    "subscriptionId": 12,
                    "name": "Supporter",
                    "currency": "RUB",
                    "periods": [
                        {"periodId": 34, "period": "monthly", "price": "500.00"},
                    ],
                },
            ],
        },
    )

    response = await CommerceCatalogService(tribute).get_tribute()
    payload = response.model_dump(by_alias=True)

    assert payload == {
        "subscriptions": [
            {
                "externalItemId": "12",
                "name": "Supporter",
                "currency": "RUB",
                "periods": [
                    {"periodId": "34", "period": "monthly", "priceMajor": "500.00"},
                ],
            },
        ],
    }


@pytest.mark.asyncio
async def test_catalog_maps_provider_failure_to_one_safe_error() -> None:
    tribute = AsyncMock()
    tribute.get_catalog.side_effect = TributeError("private provider body", status_code=500)

    with pytest.raises(CommerceCatalogUnavailableError, match="catalog is unavailable") as caught:
        await CommerceCatalogService(tribute).get_tribute()

    assert "private provider body" not in str(caught.value)


@pytest.mark.asyncio
async def test_catalog_route_maps_failure_without_provider_diagnostics() -> None:
    service = AsyncMock()
    service.get_tribute.side_effect = CommerceCatalogUnavailableError(
        "private provider diagnostic",
    )

    with pytest.raises(HTTPException) as caught:
        await get_commerce_catalog(object(), service, "tribute")  # type: ignore[arg-type]

    assert caught.value.status_code == 502
    assert caught.value.detail == "Tribute catalog is unavailable"


@pytest.mark.asyncio
async def test_catalog_route_requires_authentication_before_provider_access() -> None:
    app = create_app()
    async with AsyncClient(
        transport=ASGITransport(app=app),  # type: ignore[arg-type]
        base_url="http://test",
    ) as client:
        response = await client.get("/api/admin/commerce/catalog?provider=tribute")

    assert response.status_code == 401
