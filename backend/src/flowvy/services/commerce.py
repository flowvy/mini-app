"""Commerce-rule administration and deterministic draft evaluation."""

from __future__ import annotations

import uuid

from flowvy.models.commerce_rule import CommerceRule
from flowvy.repositories.access_profile import AccessProfileRepository
from flowvy.repositories.commerce_rule import CommerceRuleRepository
from flowvy.repositories.sponsor_offer import SponsorOfferRepository
from flowvy.schemas.commerce import (
    MAX_DURATION_DAYS,
    AmountBand,
    CommerceRuleInput,
    CommerceRulePreviewRequest,
    CommerceRulePreviewResponse,
    CommerceRuleResponse,
)


class CommerceRuleError(ValueError):
    """Safe administrator-facing commerce-rule validation failure."""


class CommerceRuleNotFoundError(CommerceRuleError):
    """Requested rule does not exist."""


def _calculator(payload: CommerceRuleInput) -> dict[str, object]:
    if payload.calculation_type == "fixed":
        return {"fixed_duration_days": payload.fixed_duration_days}
    if payload.calculation_type == "provider_expiry":
        return {}
    return {
        "amount_bands": [band.model_dump() for band in payload.amount_bands],
    }


def commerce_rule_response(rule: CommerceRule) -> CommerceRuleResponse:
    calculator = rule.calculator
    return CommerceRuleResponse(
        id=rule.id,
        provider=rule.provider,  # type: ignore[arg-type]
        name=rule.name,
        commerce_type=rule.commerce_type,  # type: ignore[arg-type]
        payment_mode=rule.payment_mode,  # type: ignore[arg-type]
        external_item_id=rule.external_item_id,
        currency=rule.currency,
        calculation_type=rule.calculation_type,  # type: ignore[arg-type]
        fixed_duration_days=calculator.get("fixed_duration_days"),  # type: ignore[arg-type]
        amount_bands=calculator.get("amount_bands", []),  # type: ignore[arg-type]
        access_profile_id=rule.access_profile_id,
        grant_mode=rule.grant_mode,  # type: ignore[arg-type]
        priority=rule.priority,
        is_enabled=rule.is_enabled,
    )


def evaluate_commerce_rule(
    payload: CommerceRuleInput,
    amount_minor: int,
) -> CommerceRulePreviewResponse:
    """Run the one canonical side-effect-free duration calculation."""
    if payload.calculation_type == "fixed":
        return CommerceRulePreviewResponse(
            matched=True,
            duration_days=payload.fixed_duration_days,
        )
    if payload.calculation_type == "provider_expiry":
        raise CommerceRuleError("Provider-expiry rules cannot be previewed from an amount")

    matched_band: AmountBand | None = None
    for band in payload.amount_bands:
        if amount_minor >= band.from_amount_minor:
            matched_band = band
        else:
            break
    if matched_band is None:
        return CommerceRulePreviewResponse(matched=False)

    duration_days = amount_minor * matched_band.unit_days // matched_band.unit_amount_minor
    if duration_days < 1:
        return CommerceRulePreviewResponse(matched=False, matched_band=matched_band)
    if duration_days > MAX_DURATION_DAYS:
        raise CommerceRuleError("Calculated duration exceeds the 36500-day safety limit")
    return CommerceRulePreviewResponse(
        matched=True,
        duration_days=duration_days,
        matched_band=matched_band,
    )


class CommerceRuleService:
    """Manage configuration without accepting or executing provider events."""

    def __init__(
        self,
        rules: CommerceRuleRepository,
        profiles: AccessProfileRepository,
        offers: SponsorOfferRepository | None = None,
    ) -> None:
        self._rules = rules
        self._profiles = profiles
        self._offers = offers

    async def list_rules(self, provider: str = "tribute") -> list[CommerceRuleResponse]:
        return [
            commerce_rule_response(rule) for rule in await self._rules.list_for_provider(provider)
        ]

    async def create_rule(
        self,
        payload: CommerceRuleInput,
        admin_id: int | None,
    ) -> CommerceRuleResponse:
        await self._require_active_profile(payload.access_profile_id)
        rule = await self._rules.create(
            **self._values(payload),
            created_by_id=admin_id,
        )
        return commerce_rule_response(rule)

    async def update_rule(
        self,
        rule_id: uuid.UUID,
        payload: CommerceRuleInput,
    ) -> CommerceRuleResponse:
        rule = await self._rules.get_by_id(rule_id)
        if rule is None:
            raise CommerceRuleNotFoundError("Commerce rule was not found")
        await self._require_active_profile(payload.access_profile_id)
        return commerce_rule_response(await self._rules.update(rule, **self._values(payload)))

    async def delete_rule(self, rule_id: uuid.UUID) -> None:
        rule = await self._rules.get_by_id(rule_id)
        if rule is None:
            raise CommerceRuleNotFoundError("Commerce rule was not found")
        if self._offers is not None and await self._offers.get_by_rule_id(rule_id) is not None:
            raise CommerceRuleError("Delete the linked sponsor offer first")
        await self._rules.delete(rule)

    async def preview(self, request: CommerceRulePreviewRequest) -> CommerceRulePreviewResponse:
        return evaluate_commerce_rule(request.rule, request.amount_minor)

    async def _require_active_profile(self, profile_id: uuid.UUID) -> None:
        if await self._profiles.get_active(profile_id) is None:
            raise CommerceRuleError("Access profile is unavailable")

    @staticmethod
    def _values(payload: CommerceRuleInput) -> dict[str, object]:
        return {
            "provider": payload.provider,
            "name": payload.name,
            "commerce_type": payload.commerce_type,
            "payment_mode": payload.payment_mode,
            "external_item_id": payload.external_item_id,
            "currency": payload.currency,
            "calculation_type": payload.calculation_type,
            "calculator": _calculator(payload),
            "access_profile_id": payload.access_profile_id,
            "grant_mode": payload.grant_mode,
            "priority": payload.priority,
            "is_enabled": payload.is_enabled,
        }


__all__ = [
    "CommerceRuleError",
    "CommerceRuleNotFoundError",
    "CommerceRuleService",
    "commerce_rule_response",
    "evaluate_commerce_rule",
]
