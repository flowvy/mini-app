"""Beszel v0.18.7 PocketBase response contracts used by Flowvy."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class BeszelContractModel(BaseModel):
    """Ignore additive fields while validating every field Flowvy consumes."""

    model_config = ConfigDict(extra="ignore")


class BeszelAuthResponse(BeszelContractModel):
    token: str = Field(min_length=16, max_length=16_384)


class BeszelSystem(BeszelContractModel):
    id: str = Field(pattern=r"^[a-z0-9]{15}$")
    name: str = Field(min_length=1, max_length=512)
    status: Literal["up", "down", "paused", "pending"]
    created: datetime


class BeszelSystemStat(BeszelContractModel):
    system: str = Field(pattern=r"^[a-z0-9]{15}$")
    created: datetime


class BeszelSystemsPage(BeszelContractModel):
    page: int = Field(ge=1)
    per_page: int = Field(alias="perPage", ge=1)
    total_items: int = Field(alias="totalItems", ge=0)
    total_pages: int = Field(alias="totalPages", ge=0)
    items: list[BeszelSystem]


class BeszelStatsPage(BeszelContractModel):
    page: int = Field(ge=1)
    per_page: int = Field(alias="perPage", ge=1)
    total_items: int = Field(alias="totalItems", ge=0)
    total_pages: int = Field(alias="totalPages", ge=0)
    items: list[BeszelSystemStat]


class BeszelSnapshot(BaseModel):
    """Normalized inputs needed to construct one Pulse response."""

    captured_at: datetime
    systems: list[BeszelSystem]
    minute_stats: list[BeszelSystemStat]
    daily_stats: list[BeszelSystemStat]
