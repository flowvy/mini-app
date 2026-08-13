"""Provider-neutral commerce-rule admin contracts."""

from __future__ import annotations

import re
import uuid
from typing import Literal, Self

from pydantic import Field, field_validator, model_validator

from flowvy.schemas.base import CamelModel

CommerceProvider = Literal["tribute"]
CommerceType = Literal["donation", "subscription", "digital_product"]
PaymentMode = Literal["any", "one_time", "recurring"]
CalculationType = Literal["fixed", "volume"]
GrantMode = Literal["extend", "replace"]

MAX_MONEY_MINOR = 9_000_000_000_000_000
MAX_DURATION_DAYS = 36_500


class AmountBand(CamelModel):
    """One volume threshold and the ratio applied to the entire payment."""

    from_amount_minor: int = Field(ge=1, le=MAX_MONEY_MINOR)
    unit_amount_minor: int = Field(ge=1, le=MAX_MONEY_MINOR)
    unit_days: int = Field(ge=1, le=MAX_DURATION_DAYS)


class CommerceRuleInput(CamelModel):
    """Editable payment-to-entitlement mapping with no execution side effects."""

    provider: CommerceProvider = "tribute"
    name: str = Field(min_length=1, max_length=100)
    commerce_type: CommerceType
    payment_mode: PaymentMode = "any"
    external_item_id: str | None = Field(default=None, max_length=128)
    currency: str = Field(min_length=3, max_length=3)
    calculation_type: CalculationType
    fixed_duration_days: int | None = Field(default=None, ge=1, le=MAX_DURATION_DAYS)
    amount_bands: list[AmountBand] = Field(default_factory=list, max_length=20)
    access_profile_id: uuid.UUID
    grant_mode: GrantMode = "extend"
    priority: int = Field(default=100, ge=1, le=10_000)
    is_enabled: bool = True

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Rule name is required")
        return normalized

    @field_validator("currency", mode="before")
    @classmethod
    def normalize_currency(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        normalized = value.strip().upper()
        if re.fullmatch(r"[A-Z]{3}", normalized) is None:
            raise ValueError("Currency must be a three-letter ISO code")
        return normalized

    @field_validator("external_item_id")
    @classmethod
    def normalize_external_item_id(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        return value.strip()

    @model_validator(mode="after")
    def validate_rule_shape(self) -> Self:
        if self.commerce_type == "donation":
            if self.external_item_id is not None:
                raise ValueError("Donation rules cannot include a provider item ID")
        elif self.external_item_id is None:
            raise ValueError("Subscription and product rules require a provider item ID")

        required_mode: PaymentMode | None = {
            "subscription": "recurring",
            "digital_product": "one_time",
        }.get(self.commerce_type)
        if required_mode is not None and self.payment_mode != required_mode:
            raise ValueError(f"{self.commerce_type} rules require {required_mode} payments")

        if self.calculation_type == "fixed":
            if self.fixed_duration_days is None or self.amount_bands:
                raise ValueError("Fixed calculation requires fixedDurationDays only")
        else:
            if self.fixed_duration_days is not None or not self.amount_bands:
                raise ValueError("Volume calculation requires amountBands only")
            thresholds = [band.from_amount_minor for band in self.amount_bands]
            if len(thresholds) != len(set(thresholds)):
                raise ValueError("Amount band thresholds must be unique")
            self.amount_bands.sort(key=lambda band: band.from_amount_minor)
        return self


class CommerceRuleResponse(CommerceRuleInput):
    """Persisted commerce rule returned to an administrator."""

    id: uuid.UUID


class CommerceRulePreviewRequest(CamelModel):
    """Side-effect-free evaluation of an unsaved or persisted rule draft."""

    rule: CommerceRuleInput
    amount_minor: int = Field(ge=0, le=MAX_MONEY_MINOR)


class CommerceRulePreviewResponse(CamelModel):
    """Deterministic duration result for one candidate amount."""

    matched: bool
    duration_days: int | None = None
    matched_band: AmountBand | None = None


__all__ = [
    "MAX_DURATION_DAYS",
    "AmountBand",
    "CommerceRuleInput",
    "CommerceRulePreviewRequest",
    "CommerceRulePreviewResponse",
    "CommerceRuleResponse",
]
