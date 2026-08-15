"""Validated Tribute API response shapes used by Flowvy."""

from __future__ import annotations

from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

TributeSubscriptionPeriodName = Literal[
    "trial",
    "onetime",
    "weekly",
    "monthly",
    "quarterly",
    "halfyearly",
    "yearly",
]


class TributeSubscriptionPeriod(BaseModel):
    """One documented subscription billing period."""

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    period_id: int = Field(alias="periodId", gt=0, strict=True)
    period: TributeSubscriptionPeriodName
    price: Decimal = Field(ge=0)


class TributeSubscription(BaseModel):
    """One documented Tribute subscription catalog entry."""

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    subscription_id: int = Field(alias="subscriptionId", gt=0, strict=True)
    name: str = Field(min_length=1)
    currency: str = Field(min_length=3, max_length=3, pattern=r"^[A-Z]{3}$")
    periods: list[TributeSubscriptionPeriod]

    @field_validator("currency", mode="before")
    @classmethod
    def normalize_currency(cls, value: object) -> object:
        """Contain Tribute's documented-but-case-unspecified currency at its boundary."""
        if isinstance(value, str):
            return value.strip().upper()
        return value


class TributeSubscriptionsResponse(BaseModel):
    """Documented response envelope for GET /api/v1/subscriptions."""

    model_config = ConfigDict(extra="ignore")

    result: list[TributeSubscription] = Field(default_factory=list)


class TributeCatalog(BaseModel):
    """Validated provider data returned by the fixed-origin read client."""

    subscriptions: list[TributeSubscription]
