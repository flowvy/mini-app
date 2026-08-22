"""Provider-neutral commerce-rule admin contracts."""

from __future__ import annotations

import datetime
import re
import uuid
from typing import Literal, Self

from pydantic import Field, field_validator, model_validator

from flowvy.localization import normalize_locale_map, placeholders
from flowvy.schemas.base import CamelModel
from flowvy.schemas.content import formatted_text_visible_length, normalize_formatted_text
from flowvy.schemas.provider_settings import PaymentDestinationUrl

CommerceProvider = Literal["tribute"]
CommerceType = Literal["donation", "subscription"]
PaymentMode = Literal["any", "one_time", "recurring"]
SponsorDonationPaymentMode = Literal["one_time", "recurring"]
CalculationType = Literal["fixed", "volume", "provider_expiry"]
GrantMode = Literal["extend", "replace"]
TributeSubscriptionPeriod = Literal[
    "trial",
    "onetime",
    "weekly",
    "monthly",
    "quarterly",
    "halfyearly",
    "yearly",
]
TributeDonationPeriod = Literal[
    "weekly",
    "monthly",
    "quarterly",
    "halfyearly",
    "yearly",
]

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
            raise ValueError("Subscription rules require a provider item ID")

        required_mode: PaymentMode | None = (
            "recurring" if self.commerce_type == "subscription" else None
        )
        if required_mode is not None and self.payment_mode != required_mode:
            raise ValueError(f"{self.commerce_type} rules require {required_mode} payments")

        if self.commerce_type == "subscription":
            if self.calculation_type != "provider_expiry":
                raise ValueError("Subscription rules must use the provider expiry")
            if self.grant_mode != "replace":
                raise ValueError("Subscription rules must replace the provider expiry")
        elif self.calculation_type == "provider_expiry":
            raise ValueError("Provider expiry calculation is only available for subscriptions")

        if self.calculation_type == "fixed":
            if self.fixed_duration_days is None or self.amount_bands:
                raise ValueError("Fixed calculation requires fixedDurationDays only")
        elif self.calculation_type == "volume":
            if self.fixed_duration_days is not None or not self.amount_bands:
                raise ValueError("Volume calculation requires amountBands only")
            thresholds = [band.from_amount_minor for band in self.amount_bands]
            if len(thresholds) != len(set(thresholds)):
                raise ValueError("Amount band thresholds must be unique")
            self.amount_bands.sort(key=lambda band: band.from_amount_minor)
        elif self.fixed_duration_days is not None or self.amount_bands:
            raise ValueError("Provider expiry calculation does not accept a duration")
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


class CommerceCatalogSubscriptionPeriod(CamelModel):
    """Display-only price period for one subscription."""

    period_id: str
    period: TributeSubscriptionPeriod
    price_major: str


class CommerceCatalogSubscription(CamelModel):
    """Allow-listed subscription data exposed to the rule editor."""

    external_item_id: str
    name: str
    currency: str
    periods: list[CommerceCatalogSubscriptionPeriod]


class CommerceCatalogResponse(CamelModel):
    """Provider-neutral read-only catalog used by commerce administration."""

    subscriptions: list[CommerceCatalogSubscription]


SponsorOfferAvailability = Literal[
    "draft",
    "ready",
    "rule_disabled",
    "profile_unavailable",
    "configuration_changed",
]
SponsorStateStatus = Literal[
    "no_access",
    "base_access",
    "checkout_pending",
    "provisioning",
    "attention",
    "one_time_active",
    "one_time_expired",
    "recurring_trial",
    "recurring_active",
    "recurring_donation_active",
    "recurring_cancelled_active",
    "recurring_expired",
    "refunded",
]
SponsorPrimaryAction = Literal[
    "choose_offer",
    "continue_checkout",
    "refresh",
    "renew",
    "manage_subscription",
    "manage_auto_donation",
    "resume_recurring",
    "none",
]


class SponsorOfferPriceOption(CamelModel):
    """One provider-confirmed display price; never used to calculate access."""

    price_major: str = Field(pattern=r"^\d+(?:\.\d+)?$")
    currency: str = Field(min_length=3, max_length=3, pattern=r"^[A-Z]{3}$")
    period: TributeSubscriptionPeriod | None = None


class SponsorOfferCheckoutSnapshot(CamelModel):
    """Server-validated provider destination frozen into an offer/attempt."""

    provider: CommerceProvider
    commerce_type: CommerceType
    payment_mode: PaymentMode
    external_item_id: str | None
    checkout_url: str = Field(min_length=1, max_length=2048)
    expected_amount_minor: int | None = Field(default=None, ge=1, le=MAX_MONEY_MINOR)
    expected_payment_mode: SponsorDonationPaymentMode | None = None
    expected_provider_period: TributeDonationPeriod | None = None
    price_options: list[SponsorOfferPriceOption] = Field(default_factory=list, max_length=20)
    requires_non_anonymous: bool = False


class SponsorOfferLocale(CamelModel):
    """Localized operator presentation for one sponsor offer."""

    title: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=2_000)

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str) -> str:
        normalized = " ".join(value.strip().split())
        if not normalized:
            raise ValueError("Offer title is required")
        unknown = placeholders(normalized) - {"appName", "app_name"}
        if unknown:
            raise ValueError(f"Unsupported offer title placeholders: {', '.join(sorted(unknown))}")
        return normalized

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str) -> str:
        normalized = normalize_formatted_text(value)
        unknown = placeholders(normalized) - {"appName", "app_name"}
        if unknown:
            raise ValueError(
                f"Unsupported offer description placeholders: {', '.join(sorted(unknown))}"
            )
        if formatted_text_visible_length(normalized) > 300:
            raise ValueError("Offer description exceeds 300 visible characters")
        return normalized


class SponsorOfferInput(CamelModel):
    """Administrator-editable public presentation linked to one commerce rule."""

    title: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=2_000)
    content_locales: dict[str, SponsorOfferLocale] | None = Field(default=None, max_length=20)
    commerce_rule_id: uuid.UUID
    checkout_url: PaymentDestinationUrl | None = None
    expected_amount_minor: int | None = Field(default=None, ge=1, le=MAX_MONEY_MINOR)
    expected_payment_mode: SponsorDonationPaymentMode | None = None
    expected_provider_period: TributeDonationPeriod | None = None
    is_published: bool = False
    sort_order: int = Field(default=100, ge=1, le=10_000)

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str) -> str:
        normalized = " ".join(value.strip().split())
        unknown = placeholders(normalized) - {"appName", "app_name"}
        if unknown:
            raise ValueError(f"Unsupported offer title placeholders: {', '.join(sorted(unknown))}")
        return normalized

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str) -> str:
        normalized = normalize_formatted_text(value)
        unknown = placeholders(normalized) - {"appName", "app_name"}
        if unknown:
            raise ValueError(
                f"Unsupported offer description placeholders: {', '.join(sorted(unknown))}"
            )
        if formatted_text_visible_length(normalized) > 300:
            raise ValueError("Offer description exceeds 300 visible characters")
        return normalized

    @field_validator("content_locales", mode="before")
    @classmethod
    def validate_content_locales(
        cls,
        value: object,
    ) -> dict[str, SponsorOfferLocale] | None:
        if value is None:
            return None
        return normalize_locale_map(value, SponsorOfferLocale)

    @model_validator(mode="after")
    def validate_expected_donation_schedule(self) -> Self:
        if self.expected_payment_mode == "one_time" and self.expected_provider_period is not None:
            raise ValueError("One-time donation offers cannot include a recurring period")
        if self.expected_payment_mode == "recurring" and self.expected_provider_period is None:
            raise ValueError("Recurring donation offers require an expected provider period")
        if self.expected_payment_mode is None and self.expected_provider_period is not None:
            raise ValueError("A donation period requires an expected payment mode")
        return self


class SponsorOfferResponse(SponsorOfferInput):
    """Provider-neutral offer safe for both admin and user surfaces."""

    id: uuid.UUID
    provider: CommerceProvider
    commerce_type: CommerceType
    payment_mode: PaymentMode
    external_item_id: str | None
    price_options: list[SponsorOfferPriceOption]
    requires_non_anonymous: bool
    availability: SponsorOfferAvailability
    content_locales: dict[str, SponsorOfferLocale] = Field(default_factory=dict, max_length=20)


class SponsorCheckoutRequest(CamelModel):
    """Intent to leave Flowvy for one published provider-hosted checkout."""

    offer_id: uuid.UUID


class SponsorCheckoutResponse(CamelModel):
    """Local pending hand-off; it is explicitly not payment confirmation."""

    id: uuid.UUID
    offer_id: uuid.UUID | None
    status: Literal["pending", "confirmed", "expired"]
    checkout_url: str
    expires_at: datetime.datetime


class SponsorStateResponse(CamelModel):
    """One server-computed sponsor/access state consumed by Home."""

    status: SponsorStateStatus
    access_level: Literal["none", "base", "paid"]
    primary_action: SponsorPrimaryAction
    paid_expires_at: datetime.datetime | None = None
    base_expires_at: datetime.datetime | None = None
    current_offer_id: uuid.UUID | None = None
    management_url: str | None = None
    pending_checkout: SponsorCheckoutResponse | None = None
    offers: list[SponsorOfferResponse]


__all__ = [
    "MAX_DURATION_DAYS",
    "AmountBand",
    "CommerceCatalogResponse",
    "CommerceCatalogSubscription",
    "CommerceCatalogSubscriptionPeriod",
    "CommerceRuleInput",
    "CommerceRulePreviewRequest",
    "CommerceRulePreviewResponse",
    "CommerceRuleResponse",
    "SponsorCheckoutRequest",
    "SponsorCheckoutResponse",
    "SponsorOfferCheckoutSnapshot",
    "SponsorOfferInput",
    "SponsorOfferLocale",
    "SponsorOfferPriceOption",
    "SponsorOfferResponse",
    "SponsorStateResponse",
]
