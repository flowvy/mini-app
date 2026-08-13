"""Validated Tribute API response shapes used by Flowvy."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class TributeProductsPage(BaseModel):
    """Minimal documented shape for GET /api/v1/products."""

    model_config = ConfigDict(extra="ignore")

    rows: list[dict[str, object]] | None = None
    meta: dict[str, object] | None = None
