"""Provider-neutral sponsor offer and user-state contracts."""

from __future__ import annotations

import datetime
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from flowvy.api.routes.admin.commerce import _sponsor_offer_error
from flowvy.config import Settings
from flowvy.models.commerce_rule import CommerceRule
from flowvy.models.entitlement_operation import EntitlementOperation
from flowvy.models.sponsor_checkout import SponsorCheckout
from flowvy.models.sponsor_offer import SponsorOffer
from flowvy.schemas.commerce import (
    CommerceCatalogResponse,
    CommerceCatalogSubscription,
    CommerceCatalogSubscriptionPeriod,
    SponsorOfferInput,
    SponsorOfferResponse,
)
from flowvy.services.sponsor import (
    SponsorCheckoutConflictError,
    SponsorOfferDestinationMissingError,
    SponsorOfferError,
    SponsorOfferService,
    SponsorStateService,
)

NOW = datetime.datetime(2026, 8, 14, 6, 0, tzinfo=datetime.UTC)
RULE_ID = uuid.UUID("11111111-1111-4111-8111-111111111111")
OFFER_ID = uuid.UUID("22222222-2222-4222-8222-222222222222")
PROFILE_ID = uuid.UUID("33333333-3333-4333-8333-333333333333")


def test_sponsor_offer_copy_preserves_portable_formatting() -> None:
    payload = SponsorOfferInput(
        title="  Sponsor   access  ",
        description="  **Thank you**\r\n\r\n- Faster support\r- More traffic  ",
        commerce_rule_id=RULE_ID,
    )

    assert payload.title == "Sponsor access"
    assert payload.description == "**Thank you**\n\n- Faster support\n- More traffic"


def test_sponsor_offer_copy_allows_formatting_source_overhead() -> None:
    visible_copy = "A" * 300
    payload = SponsorOfferInput(
        title="Sponsor",
        description=f"**{visible_copy}**",
        commerce_rule_id=uuid.uuid4(),
    )

    assert payload.description == f"**{visible_copy}**"


def _settings(monkeypatch: pytest.MonkeyPatch) -> Settings:
    monkeypatch.setenv("REMNAWAVE_URL", "https://panel.example.test")
    monkeypatch.setenv("REMNAWAVE_API_TOKEN", "placeholder")
    return Settings()


def _rule(commerce_type: str = "subscription") -> CommerceRule:
    is_subscription = commerce_type == "subscription"
    return CommerceRule(
        id=RULE_ID,
        provider="tribute",
        name="Sponsor",
        commerce_type=commerce_type,
        payment_mode="recurring" if is_subscription else "one_time",
        external_item_id="42" if commerce_type != "donation" else None,
        currency="RUB",
        calculation_type="provider_expiry" if is_subscription else "fixed",
        calculator={} if is_subscription else {"fixed_duration_days": 30},
        access_profile_id=PROFILE_ID,
        grant_mode="replace" if is_subscription else "extend",
        priority=100,
        is_enabled=True,
        created_by_id=1,
    )


def _offer(snapshot: dict[str, object]) -> SponsorOffer:
    return SponsorOffer(
        id=OFFER_ID,
        provider="tribute",
        commerce_rule_id=RULE_ID,
        title="30 days",
        description="Extended sponsor access",
        checkout_snapshot=snapshot,
        is_published=True,
        sort_order=10,
        created_by_id=1,
    )


@pytest.mark.asyncio
async def test_subscription_offer_preserves_all_documented_provider_periods() -> None:
    rule = _rule("subscription")
    offers = AsyncMock()
    offers.get_by_rule_id.return_value = None
    offers.list_all.return_value = []
    offers.create.side_effect = lambda **values: SponsorOffer(id=OFFER_ID, **values)
    rules = AsyncMock()
    rules.get_by_id.return_value = rule
    profiles = AsyncMock()
    profiles.get_active.return_value = SimpleNamespace(id=PROFILE_ID)
    provider_settings = AsyncMock()
    provider_settings.get.return_value = SimpleNamespace(
        tribute_donation_url=None,
        tribute_subscription_urls={"42": "https://t.me/tribute/app?startapp=sub"},
    )
    catalog = AsyncMock()
    catalog.get_tribute.return_value = CommerceCatalogResponse(
        subscriptions=[
            CommerceCatalogSubscription(
                external_item_id="42",
                name="Sponsor",
                currency="RUB",
                periods=[
                    CommerceCatalogSubscriptionPeriod(
                        period_id="1",
                        period="monthly",
                        price_major="500",
                    ),
                    CommerceCatalogSubscriptionPeriod(
                        period_id="2",
                        period="yearly",
                        price_major="3500",
                    ),
                ],
            ),
        ],
    )
    service = SponsorOfferService(
        offers,
        rules,
        profiles,
        provider_settings,
        catalog,
    )

    result = await service.create(
        SponsorOfferInput(
            title="Recurring sponsor",
            commerce_rule_id=RULE_ID,
            is_published=True,
        ),
        admin_id=1,
    )

    assert [(item.price_major, item.period) for item in result.price_options] == [
        ("500", "monthly"),
        ("3500", "yearly"),
    ]


@pytest.mark.asyncio
async def test_subscription_offer_reports_missing_destination_with_stable_code() -> None:
    rule = _rule("subscription")
    offers = AsyncMock()
    offers.list_all.return_value = []
    rules = AsyncMock()
    rules.get_by_id.return_value = rule
    profiles = AsyncMock()
    profiles.get_active.return_value = SimpleNamespace(id=PROFILE_ID)
    provider_settings = AsyncMock()
    provider_settings.get.return_value = SimpleNamespace(tribute_subscription_urls={})
    catalog = AsyncMock()
    catalog.get_tribute.return_value = CommerceCatalogResponse(
        subscriptions=[
            CommerceCatalogSubscription(
                external_item_id="42",
                name="Sponsor",
                currency="RUB",
                periods=[
                    CommerceCatalogSubscriptionPeriod(
                        period_id="1",
                        period="monthly",
                        price_major="500",
                    )
                ],
            )
        ],
    )
    service = SponsorOfferService(
        offers,
        rules,
        profiles,
        provider_settings,
        catalog,
    )

    with pytest.raises(SponsorOfferDestinationMissingError) as error:
        await service.create(
            SponsorOfferInput(
                title="Recurring sponsor",
                commerce_rule_id=RULE_ID,
                is_published=True,
            ),
            admin_id=1,
        )

    assert error.value.code == "tribute_subscription_destination_missing"
    offers.create.assert_not_awaited()


def test_missing_destination_error_has_stable_admin_http_contract() -> None:
    response = _sponsor_offer_error(
        SponsorOfferDestinationMissingError("Tribute subscription destination is not configured")
    )

    assert response.status_code == 422
    assert response.detail == {
        "code": "tribute_subscription_destination_missing",
        "message": "Tribute subscription destination is not configured",
    }


@pytest.mark.asyncio
async def test_one_published_subscription_offer_contains_all_provider_periods() -> None:
    rule = _rule("subscription")
    existing = _offer(
        {
            "provider": "tribute",
            "commerce_type": "subscription",
            "payment_mode": "recurring",
            "external_item_id": "42",
            "checkout_url": "https://t.me/tribute/app?startapp=subscription",
            "price_options": [
                {"price_major": "500", "currency": "RUB", "period": "monthly"},
                {"price_major": "3500", "currency": "RUB", "period": "yearly"},
            ],
        },
    )
    offers = AsyncMock()
    offers.list_all.return_value = [existing]
    rules = AsyncMock()
    rules.get_by_id.return_value = rule
    profiles = AsyncMock()
    profiles.get_active.return_value = SimpleNamespace(id=PROFILE_ID)
    service = SponsorOfferService(
        offers,
        rules,
        profiles,
        AsyncMock(),
        AsyncMock(),
    )

    with pytest.raises(SponsorOfferError, match="one offer includes all periods"):
        await service.create(
            SponsorOfferInput(
                title="Duplicate yearly card",
                commerce_rule_id=RULE_ID,
                is_published=True,
            ),
            admin_id=1,
        )

    offers.create.assert_not_awaited()


@pytest.mark.asyncio
async def test_identified_donation_offer_publishes_its_own_link_and_expected_amount() -> None:
    rule = _rule("donation")
    rule.calculation_type = "volume"
    rule.calculator = {
        "amount_bands": [
            {"from_amount_minor": 50_000, "unit_amount_minor": 50_000, "unit_days": 30},
            {
                "from_amount_minor": 350_000,
                "unit_amount_minor": 350_000,
                "unit_days": 365,
            },
        ],
    }
    offers = AsyncMock()
    offers.get_by_rule_id.return_value = None
    offers.create.side_effect = lambda **values: SponsorOffer(id=OFFER_ID, **values)
    rules = AsyncMock()
    rules.get_by_id.return_value = rule
    profiles = AsyncMock()
    profiles.get_active.return_value = SimpleNamespace(id=PROFILE_ID)
    provider_settings = AsyncMock()
    provider_settings.get.return_value = SimpleNamespace(tribute_subscription_urls={})
    catalog = AsyncMock()
    service = SponsorOfferService(
        offers,
        rules,
        profiles,
        provider_settings,
        catalog,
    )

    result = await service.create(
        SponsorOfferInput(
            title="One month sponsor",
            commerce_rule_id=RULE_ID,
            checkout_url="https://t.me/tribute/app?startapp=month",
            expected_amount_minor=50_000,
            expected_payment_mode="one_time",
            is_published=True,
        ),
        admin_id=1,
    )

    assert result.checkout_url == "https://t.me/tribute/app?startapp=month"
    assert result.expected_amount_minor == 50_000
    assert result.expected_payment_mode == "one_time"
    assert result.expected_provider_period is None
    assert [option.price_major for option in result.price_options] == ["500.00"]
    assert result.requires_non_anonymous is True
    catalog.get_tribute.assert_not_awaited()


@pytest.mark.asyncio
async def test_multiple_donation_offers_can_reuse_one_flexible_rule() -> None:
    rule = _rule("donation")
    rule.calculation_type = "volume"
    rule.calculator = {
        "amount_bands": [
            {"from_amount_minor": 50_000, "unit_amount_minor": 50_000, "unit_days": 30},
            {
                "from_amount_minor": 350_000,
                "unit_amount_minor": 350_000,
                "unit_days": 365,
            },
        ],
    }
    offers = AsyncMock()
    offers.create.side_effect = lambda **values: SponsorOffer(id=uuid.uuid4(), **values)
    rules = AsyncMock()
    rules.get_by_id.return_value = rule
    profiles = AsyncMock()
    profiles.get_active.return_value = SimpleNamespace(id=PROFILE_ID)
    provider_settings = AsyncMock()
    provider_settings.get.return_value = SimpleNamespace(tribute_subscription_urls={})
    service = SponsorOfferService(
        offers,
        rules,
        profiles,
        provider_settings,
        AsyncMock(),
    )

    for title, url, amount in (
        ("One month", "https://t.me/tribute/app?startapp=month", 50_000),
        ("One year", "https://t.me/tribute/app?startapp=year", 350_000),
    ):
        await service.create(
            SponsorOfferInput(
                title=title,
                commerce_rule_id=RULE_ID,
                checkout_url=url,
                expected_amount_minor=amount,
                expected_payment_mode="one_time",
                is_published=True,
            ),
            admin_id=1,
        )

    assert offers.create.await_count == 2
    offers.get_by_rule_id.assert_not_awaited()


@pytest.mark.asyncio
async def test_recurring_donation_offer_freezes_the_exact_provider_period() -> None:
    rule = _rule("donation")
    rule.payment_mode = "any"
    offers = AsyncMock()
    offers.create.side_effect = lambda **values: SponsorOffer(id=OFFER_ID, **values)
    rules = AsyncMock()
    rules.get_by_id.return_value = rule
    profiles = AsyncMock()
    profiles.get_active.return_value = SimpleNamespace(id=PROFILE_ID)
    service = SponsorOfferService(
        offers,
        rules,
        profiles,
        AsyncMock(),
        AsyncMock(),
    )

    result = await service.create(
        SponsorOfferInput(
            title="Monthly auto-donation",
            commerce_rule_id=RULE_ID,
            checkout_url="https://t.me/tribute/app?startapp=monthly",
            expected_amount_minor=50_000,
            expected_payment_mode="recurring",
            expected_provider_period="monthly",
            is_published=True,
        ),
        admin_id=1,
    )

    assert result.expected_payment_mode == "recurring"
    assert result.expected_provider_period == "monthly"
    assert result.price_options[0].period == "monthly"


@pytest.mark.asyncio
async def test_donation_offer_schedule_must_fit_a_narrow_rule() -> None:
    offers = AsyncMock()
    rules = AsyncMock()
    rules.get_by_id.return_value = _rule("donation")
    service = SponsorOfferService(
        offers,
        rules,
        AsyncMock(),
        AsyncMock(),
        AsyncMock(),
    )

    with pytest.raises(SponsorOfferError, match="schedule"):
        await service.create(
            SponsorOfferInput(
                title="Wrong cadence",
                commerce_rule_id=RULE_ID,
                checkout_url="https://t.me/tribute/app?startapp=monthly",
                expected_amount_minor=50_000,
                expected_payment_mode="recurring",
                expected_provider_period="monthly",
            ),
            admin_id=1,
        )

    offers.create.assert_not_awaited()


@pytest.mark.asyncio
async def test_published_offer_fails_closed_after_its_rule_no_longer_matches() -> None:
    rule = _rule("donation")
    rule.calculation_type = "volume"
    rule.calculator = {
        "amount_bands": [
            {"from_amount_minor": 100_000, "unit_amount_minor": 100_000, "unit_days": 30},
        ],
    }
    offer = _offer(
        {
            "provider": "tribute",
            "commerce_type": "donation",
            "payment_mode": "one_time",
            "external_item_id": None,
            "checkout_url": "https://t.me/tribute/app?startapp=month",
            "expected_amount_minor": 50_000,
            "price_options": [
                {"price_major": "500.00", "currency": "RUB", "period": None},
            ],
            "requires_non_anonymous": True,
        },
    )
    offer.checkout_url = "https://t.me/tribute/app?startapp=month"
    offer.expected_amount_minor = 50_000
    offers = AsyncMock()
    offers.list_all.return_value = [offer]
    rules = AsyncMock()
    rules.get_by_id.return_value = rule
    profiles = AsyncMock()
    profiles.get_active.return_value = SimpleNamespace(id=PROFILE_ID)
    service = SponsorOfferService(
        offers,
        rules,
        profiles,
        AsyncMock(),
        AsyncMock(),
    )

    result = await service.list_admin()

    assert result[0].availability == "configuration_changed"
    assert await service.list_published() == []


def _public_offer() -> SponsorOfferResponse:
    return SponsorOfferResponse(
        id=OFFER_ID,
        title="Monthly sponsor",
        description="Extended access",
        commerce_rule_id=RULE_ID,
        is_published=True,
        sort_order=10,
        provider="tribute",
        commerce_type="subscription",
        payment_mode="recurring",
        external_item_id="42",
        checkout_url="https://t.me/tribute/app?startapp=sub",
        price_options=[{"priceMajor": "500", "currency": "RUB", "period": "monthly"}],
        requires_non_anonymous=False,
        availability="ready",
    )


def _state_service(
    monkeypatch: pytest.MonkeyPatch,
    *,
    operations: list[EntitlementOperation],
    active: list[EntitlementOperation],
    latest_subscription: object | None = None,
    latest_recurring_donation: object | None = None,
    latest_recurring_donation_payment: object | None = None,
    baseline: object | None = None,
    pending_checkout: SponsorCheckout | None = None,
    source_event: object | None = None,
    confirmed_checkout: SponsorCheckout | None = None,
) -> SponsorStateService:
    offer_service = AsyncMock()
    offer_service.list_published.return_value = [_public_offer()]
    offer_repository = AsyncMock()
    offer_repository.get_by_rule_id.return_value = SimpleNamespace(id=OFFER_ID)
    offer_repository.get_by_id.return_value = SimpleNamespace(id=OFFER_ID)
    checkouts = AsyncMock()
    checkouts.expire_pending.return_value = pending_checkout
    checkouts.confirm_matching.return_value = (
        SimpleNamespace(checkout=confirmed_checkout, mismatch_reason=None)
        if confirmed_checkout is not None
        else None
    )
    checkouts.get_by_provider_event_id.return_value = None
    operation_repo = AsyncMock()
    operation_repo.list_for_user.return_value = operations
    operation_repo.uncompensated_applied_grants.return_value = active
    events = AsyncMock()
    events.get_by_id.return_value = source_event
    events.latest_subscription_for_user.return_value = latest_subscription
    events.latest_recurring_donation_for_user.return_value = latest_recurring_donation
    events.latest_recurring_donation_payment_for_user.return_value = (
        latest_recurring_donation_payment
    )
    baselines = AsyncMock()
    baselines.get_by_id.return_value = baseline
    subscriptions = AsyncMock()
    subscriptions.get_by_user_id.return_value = []
    return SponsorStateService(
        offer_service,
        offer_repository,
        checkouts,
        operation_repo,
        events,
        baselines,
        subscriptions,
        AsyncMock(),
        _settings(monkeypatch),
        clock=lambda: NOW,
    )


def _operation(
    *,
    status: str,
    target: datetime.datetime | None,
    source_event_id: int | None = None,
    commerce_type: str = "subscription",
) -> EntitlementOperation:
    return EntitlementOperation(
        id=uuid.uuid4(),
        provider="tribute",
        semantic_key="subscription:state:test",
        event_name="new_subscription",
        operation_kind="grant",
        status=status,
        provider_created_at=NOW,
        telegram_user_id=123,
        user_id=123,
        external_item_id="42",
        currency="RUB",
        source_event_id=source_event_id,
        rule_id=RULE_ID,
        rule_snapshot={"commerce_type": commerce_type},
        target_expiry=target,
        attempt_count=0,
    )


@pytest.mark.asyncio
async def test_state_uses_provider_trial_and_exact_expiry(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    expiry = NOW + datetime.timedelta(days=7)
    grant = _operation(status="applied", target=expiry)
    service = _state_service(
        monkeypatch,
        operations=[grant],
        active=[grant],
        latest_subscription=SimpleNamespace(
            event_name="new_subscription",
            provider_expires_at=expiry,
            subscription_type="trial",
        ),
    )

    result = await service.get_state(123)

    assert result.status == "recurring_trial"
    assert result.primary_action == "manage_subscription"
    assert result.paid_expires_at == expiry
    assert result.management_url == "https://t.me/tribute"


@pytest.mark.asyncio
async def test_cancelled_subscription_keeps_paid_term_and_offers_resume(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    expiry = NOW + datetime.timedelta(days=20)
    grant = _operation(status="applied", target=expiry)
    service = _state_service(
        monkeypatch,
        operations=[grant],
        active=[grant],
        latest_subscription=SimpleNamespace(
            event_name="cancelled_subscription",
            provider_expires_at=expiry,
            subscription_type="regular",
        ),
    )

    result = await service.get_state(123)

    assert result.status == "recurring_cancelled_active"
    assert result.primary_action == "resume_recurring"
    assert result.access_level == "paid"


@pytest.mark.asyncio
async def test_initial_recurring_donation_does_not_claim_current_auto_renewal(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    expiry = NOW + datetime.timedelta(days=30)
    payment = SimpleNamespace(
        id=77,
        event_name="new_donation",
        provider_created_at=NOW,
    )
    grant = _operation(
        status="applied",
        target=expiry,
        source_event_id=payment.id,
        commerce_type="donation",
    )
    service = _state_service(
        monkeypatch,
        operations=[grant],
        active=[grant],
        latest_recurring_donation=payment,
        latest_recurring_donation_payment=payment,
    )

    result = await service.get_state(123)

    assert result.status == "recurring_donation_active"
    assert result.primary_action == "manage_auto_donation"
    assert result.paid_expires_at == expiry
    assert result.management_url == "https://t.me/tribute"


@pytest.mark.asyncio
async def test_cancelled_recurring_donation_arriving_at_period_end_offers_resume(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    expiry = NOW
    payment = SimpleNamespace(
        id=77,
        event_name="new_donation",
        provider_created_at=NOW,
    )
    cancellation = SimpleNamespace(
        id=78,
        event_name="cancelled_donation",
        provider_created_at=expiry,
    )
    grant = _operation(
        status="applied",
        target=expiry,
        source_event_id=payment.id,
        commerce_type="donation",
    )
    service = _state_service(
        monkeypatch,
        operations=[grant],
        active=[],
        latest_recurring_donation=cancellation,
        latest_recurring_donation_payment=payment,
    )

    result = await service.get_state(123)

    assert result.status == "recurring_expired"
    assert result.primary_action == "resume_recurring"
    assert result.access_level == "none"
    assert result.paid_expires_at is None
    assert result.management_url is None


@pytest.mark.asyncio
async def test_expired_recurring_donation_offers_resume_instead_of_one_time_renewal(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payment = SimpleNamespace(
        id=77,
        event_name="recurrent_donation",
        provider_created_at=NOW - datetime.timedelta(days=31),
    )
    grant = _operation(
        status="applied",
        target=NOW - datetime.timedelta(days=1),
        source_event_id=payment.id,
        commerce_type="donation",
    )
    service = _state_service(
        monkeypatch,
        operations=[grant],
        active=[],
        latest_recurring_donation=payment,
        latest_recurring_donation_payment=payment,
    )

    result = await service.get_state(123)

    assert result.status == "recurring_expired"
    assert result.primary_action == "resume_recurring"
    assert result.access_level == "none"


@pytest.mark.asyncio
async def test_pending_provider_grant_blocks_another_payment_state(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    pending = _operation(status="pending", target=NOW + datetime.timedelta(days=30))
    service = _state_service(monkeypatch, operations=[pending], active=[])

    result = await service.get_state(123)

    assert result.status == "provisioning"
    assert result.primary_action == "refresh"


@pytest.mark.asyncio
async def test_state_repairs_checkout_link_from_applied_signed_donation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    grant = _operation(
        status="applied",
        target=NOW + datetime.timedelta(days=30),
        source_event_id=77,
        commerce_type="donation",
    )
    pending = SponsorCheckout(
        id=uuid.UUID("44444444-4444-4444-8444-444444444444"),
        user_id=123,
        offer_id=OFFER_ID,
        provider="tribute",
        commerce_type="donation",
        payment_mode="any",
        external_item_id=None,
        status="pending",
        offer_snapshot=_public_offer().model_dump(mode="json"),
        expires_at=NOW + datetime.timedelta(minutes=15),
    )
    service = _state_service(
        monkeypatch,
        operations=[grant],
        active=[grant],
        pending_checkout=pending,
        source_event=SimpleNamespace(id=77),
        confirmed_checkout=pending,
    )

    result = await service.get_state(123)

    assert result.status == "one_time_active"
    assert result.primary_action == "renew"
    assert result.pending_checkout is None
    assert result.current_offer_id == OFFER_ID


@pytest.mark.asyncio
async def test_review_is_visible_even_when_previous_paid_access_is_still_active(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    active = _operation(status="applied", target=NOW + datetime.timedelta(days=30))
    review = _operation(status="review", target=None)
    review.operation_kind = "refund"
    service = _state_service(
        monkeypatch,
        operations=[active, review],
        active=[active],
    )

    result = await service.get_state(123)

    assert result.status == "attention"
    assert result.primary_action == "refresh"
    assert result.access_level == "paid"


def _checkout_service(
    monkeypatch: pytest.MonkeyPatch,
    *,
    pending: SponsorCheckout | None,
    active: list[EntitlementOperation] | None = None,
) -> tuple[SponsorStateService, AsyncMock, AsyncMock]:
    offers = AsyncMock()
    offers.get_ready.return_value = _public_offer()
    checkouts = AsyncMock()
    checkouts.expire_pending.return_value = pending
    checkouts.create.side_effect = lambda **values: SponsorCheckout(
        id=uuid.UUID("44444444-4444-4444-8444-444444444444"),
        **values,
    )
    users = AsyncMock()
    users.get_by_telegram_id_for_update.return_value = SimpleNamespace(id=123, is_active=True)
    operations = AsyncMock()
    operations.uncompensated_applied_grants.return_value = active or []
    service = SponsorStateService(
        offers,
        AsyncMock(),
        checkouts,
        operations,
        AsyncMock(),
        AsyncMock(),
        AsyncMock(),
        users,
        _settings(monkeypatch),
        clock=lambda: NOW,
    )
    return service, offers, checkouts


@pytest.mark.asyncio
async def test_start_checkout_records_intent_without_confirming_payment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service, _offers, checkouts = _checkout_service(monkeypatch, pending=None)

    result = await service.start_checkout(123, OFFER_ID)

    assert result.status == "pending"
    assert result.checkout_url == "https://t.me/tribute/app?startapp=sub"
    assert result.expires_at == NOW + datetime.timedelta(minutes=30)
    values = checkouts.create.await_args.kwargs
    assert values["user_id"] == 123
    assert values["offer_id"] == OFFER_ID
    assert values["external_item_id"] == "42"
    assert values["status"] == "pending"
    assert "confirmed_at" not in values


@pytest.mark.asyncio
async def test_same_pending_offer_is_reused_instead_of_creating_duplicate(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    pending = SponsorCheckout(
        id=uuid.UUID("44444444-4444-4444-8444-444444444444"),
        user_id=123,
        offer_id=OFFER_ID,
        provider="tribute",
        commerce_type="subscription",
        payment_mode="recurring",
        external_item_id="42",
        status="pending",
        offer_snapshot=_public_offer().model_dump(mode="json"),
        expires_at=NOW + datetime.timedelta(minutes=15),
    )
    service, offers, checkouts = _checkout_service(monkeypatch, pending=pending)

    result = await service.start_checkout(123, OFFER_ID)

    assert result.id == pending.id
    offers.get_ready.assert_not_awaited()
    checkouts.create.assert_not_awaited()


@pytest.mark.asyncio
async def test_abandon_checkout_expires_only_the_local_pending_intent(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service, _offers, checkouts = _checkout_service(monkeypatch, pending=None)
    checkout_id = uuid.UUID("44444444-4444-4444-8444-444444444444")

    await service.abandon_checkout(123, checkout_id)

    checkouts.abandon_pending.assert_awaited_once_with(123, checkout_id)


@pytest.mark.asyncio
async def test_abandon_checkout_requires_an_active_local_user(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service, _offers, checkouts = _checkout_service(monkeypatch, pending=None)
    service._users.get_by_telegram_id_for_update.return_value = None

    with pytest.raises(SponsorOfferError, match="Active user account required"):
        await service.abandon_checkout(
            123,
            uuid.UUID("44444444-4444-4444-8444-444444444444"),
        )

    checkouts.abandon_pending.assert_not_awaited()


@pytest.mark.asyncio
async def test_different_pending_offer_blocks_second_payment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    pending = SponsorCheckout(
        id=uuid.UUID("44444444-4444-4444-8444-444444444444"),
        user_id=123,
        offer_id=uuid.UUID("55555555-5555-4555-8555-555555555555"),
        provider="tribute",
        commerce_type="donation",
        payment_mode="one_time",
        external_item_id=None,
        status="pending",
        offer_snapshot=_public_offer().model_dump(mode="json"),
        expires_at=NOW + datetime.timedelta(minutes=15),
    )
    service, offers, checkouts = _checkout_service(monkeypatch, pending=pending)

    with pytest.raises(SponsorCheckoutConflictError, match="still awaiting"):
        await service.start_checkout(123, OFFER_ID)

    offers.get_ready.assert_not_awaited()
    checkouts.create.assert_not_awaited()


@pytest.mark.asyncio
async def test_active_subscription_blocks_another_subscription_checkout(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    current = _operation(
        status="applied",
        target=NOW + datetime.timedelta(days=20),
    )
    service, offers, checkouts = _checkout_service(
        monkeypatch,
        pending=None,
        active=[current],
    )

    with pytest.raises(SponsorCheckoutConflictError, match="current paid period ends"):
        await service.start_checkout(123, OFFER_ID)

    offers.get_ready.assert_awaited_once_with(OFFER_ID)
    checkouts.create.assert_not_awaited()
