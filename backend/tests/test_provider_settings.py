"""Provider-settings validation and Kuma seam tests."""

from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from pydantic import ValidationError

from flowvy.api.routes.users import build_user_response
from flowvy.config import Settings
from flowvy.schemas.provider_settings import (
    BeszelTestRequest,
    KumaTestRequest,
    ProviderSettingsPatch,
)
from flowvy.services.beszel import BeszelError
from flowvy.services.kuma import KumaError
from flowvy.services.provider_settings import ProviderSettingsError, ProviderSettingsService
from flowvy.services.pulse import CACHE_KEY
from flowvy.services.tribute import TributeError


def _row(**overrides: object) -> SimpleNamespace:
    values: dict[str, object] = {
        "pulse_provider": "disabled",
        "kuma_url": None,
        "kuma_slug": None,
        "beszel_url": None,
        "app_name": None,
        "logo_url": None,
        "welcome_text": None,
        "welcome_media_url": None,
        "welcome_media_type": None,
        "welcome_media_file_id": None,
        "welcome_media_file_name": None,
        "welcome_button_text": None,
        "invite_share_media_type": None,
        "invite_share_media_file_id": None,
        "invite_share_media_file_name": None,
        "invite_share_preview_mode": "auto",
        "invite_share_allow_user_chats": True,
        "invite_share_allow_bot_chats": False,
        "invite_share_allow_group_chats": True,
        "invite_share_allow_channel_chats": False,
        "content_default_locale": "en",
        "content_locales": {},
        "tribute_donation_url": None,
        "tribute_subscription_urls": {},
        "referral_reward_enabled": False,
        "referral_reward_days": None,
        "referral_reward_access_profile_id": None,
        "welcome_discount_enabled": False,
        "welcome_discount_offer_id": None,
        "welcome_discount_url": None,
        "welcome_discount_percent": None,
        "updated_at": datetime(2026, 8, 2, tzinfo=UTC),
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def _service(
    row: SimpleNamespace,
    *,
    profiles: AsyncMock | None = None,
    offers: AsyncMock | None = None,
) -> tuple[ProviderSettingsService, AsyncMock, AsyncMock, AsyncMock]:
    repo = AsyncMock()
    repo.get = AsyncMock(return_value=row)
    repo.update_partial = AsyncMock(return_value=row)
    remnawave = AsyncMock()
    remnawave.get_metadata = AsyncMock(return_value={"version": "2.7.4"})
    kuma = AsyncMock()
    beszel = AsyncMock()
    beszel.credentials_configured = True
    tribute = AsyncMock()
    tribute.credentials_configured = False
    redis = AsyncMock()
    redis.delete = AsyncMock(return_value=1)
    profiles = profiles or AsyncMock()
    offers = offers or AsyncMock()
    return (
        ProviderSettingsService(
            repo,
            remnawave,
            kuma,
            beszel,
            tribute,
            redis,
            Settings(_env_file=None),
            profiles,
            offers,
        ),
        kuma,
        beszel,
        redis,
    )


@pytest.mark.asyncio
async def test_referral_reward_requires_active_automation_profile() -> None:
    profiles = AsyncMock()
    profiles.get_active.return_value = SimpleNamespace(
        validity_mode="duration",
        status="ACTIVE",
    )
    service, _kuma, _beszel, _redis = _service(_row(), profiles=profiles)

    with pytest.raises(ProviderSettingsError, match="automation access profile"):
        await service.update(
            ProviderSettingsPatch(
                referral_reward_enabled=True,
                referral_reward_days=7,
                referral_reward_access_profile_id="11111111-1111-4111-8111-111111111111",
            )
        )


@pytest.mark.asyncio
async def test_independent_referral_benefits_accept_complete_configuration() -> None:
    profile_id = "11111111-1111-4111-8111-111111111111"
    offer_id = "22222222-2222-4222-8222-222222222222"
    profiles = AsyncMock()
    profiles.get_active.return_value = SimpleNamespace(
        validity_mode="automation",
        status="ACTIVE",
    )
    offers = AsyncMock()
    offers.get_ready.return_value = SimpleNamespace(commerce_type="subscription")
    service, _kuma, _beszel, _redis = _service(
        _row(),
        profiles=profiles,
        offers=offers,
    )

    await service.update(
        ProviderSettingsPatch(
            referral_reward_enabled=True,
            referral_reward_days=7,
            referral_reward_access_profile_id=profile_id,
            welcome_discount_enabled=True,
            welcome_discount_offer_id=offer_id,
            welcome_discount_url="https://t.me/tribute/app?startapp=promo",
            welcome_discount_percent=25,
        )
    )

    profiles.get_active.assert_awaited_once()
    offers.get_ready.assert_awaited_once()


@pytest.mark.parametrize("percent", [0, 100])
def test_welcome_discount_percentage_must_be_between_one_and_ninety_nine(
    percent: int,
) -> None:
    with pytest.raises(ValidationError):
        ProviderSettingsPatch(welcome_discount_percent=percent)


@pytest.mark.asyncio
async def test_welcome_discount_requires_configured_percentage() -> None:
    offers = AsyncMock()
    offers.get_ready.return_value = SimpleNamespace(commerce_type="subscription")
    service, _kuma, _beszel, _redis = _service(_row(), offers=offers)

    with pytest.raises(ProviderSettingsError, match="percentage"):
        await service.update(
            ProviderSettingsPatch(
                welcome_discount_enabled=True,
                welcome_discount_offer_id="22222222-2222-4222-8222-222222222222",
                welcome_discount_url="https://t.me/tribute/app?startapp=promo",
            )
        )


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("kuma_url", "http://public.example.test"),
        ("kuma_url", "https://user@status.example.test"),
        ("kuma_url", "https://status.example.test/path"),
        ("kuma_slug", "../admin"),
        ("kuma_slug", "bad/slash"),
        ("beszel_url", "https://user@monitor.example.test"),
        ("beszel_url", "https://monitor.example.test/api"),
    ],
)
def test_patch_rejects_unsafe_provider_url_syntax(field: str, value: str) -> None:
    # Plain HTTP can be syntactically valid for an operator allow-listed private
    # origin; network policy, rather than request parsing, rejects public HTTP.
    if field == "kuma_url" and value == "http://public.example.test":
        patch = ProviderSettingsPatch(**{field: value})
        assert patch.kuma_url == value
        return
    with pytest.raises(ValidationError):
        ProviderSettingsPatch(**{field: value})


@pytest.mark.parametrize(
    "value",
    [
        "not a URL",
        "http://pay.example.test/donation",
        "https://user:secret@pay.example.test/donation",
        "https://pay.example.test/donation#confirm",
    ],
)
def test_patch_rejects_unsafe_payment_destinations(value: str) -> None:
    with pytest.raises(ValidationError):
        ProviderSettingsPatch(tribute_donation_url=value)


def test_patch_normalizes_payment_destinations_without_assuming_provider_host() -> None:
    patch = ProviderSettingsPatch(
        tribute_donation_url="  https://pay.example.test/donation?campaign=flowvy  ",
        tribute_subscription_urls={
            "12": "https://t.me/tribute/app?startapp=subscription_12",
        },
    )

    assert patch.tribute_donation_url == "https://pay.example.test/donation?campaign=flowvy"
    assert patch.tribute_subscription_urls == {
        "12": "https://t.me/tribute/app?startapp=subscription_12"
    }


@pytest.mark.parametrize("subscription_id", ["0", "-1", "abc", " 12 "])
def test_patch_rejects_invalid_subscription_mapping_keys(subscription_id: str) -> None:
    with pytest.raises(ValidationError):
        ProviderSettingsPatch(
            tribute_subscription_urls={subscription_id: "https://pay.example.test/subscription"}
        )


@pytest.mark.asyncio
async def test_payment_destinations_are_exposed_and_persisted_without_provider_calls() -> None:
    row = _row(
        tribute_donation_url="https://pay.example.test/donation",
        tribute_subscription_urls={"12": "https://pay.example.test/subscription/12"},
    )
    service, _kuma, _beszel, redis = _service(row)

    payload = (await service.get()).model_dump(by_alias=True)
    await service.update(
        ProviderSettingsPatch(
            tribute_donation_url=None,
            tribute_subscription_urls={},
        )
    )

    assert payload["tributeDonationUrl"] == "https://pay.example.test/donation"
    assert payload["tributeSubscriptionUrls"] == {"12": "https://pay.example.test/subscription/12"}
    service._repo.update_partial.assert_awaited_once_with(
        {"tribute_donation_url": None, "tribute_subscription_urls": {}}
    )
    service._tribute.test_connection.assert_not_awaited()
    redis.delete.assert_not_awaited()


@pytest.mark.asyncio
async def test_enabling_kuma_requires_complete_saved_target() -> None:
    service, _kuma, _beszel, _redis = _service(_row())

    with pytest.raises(ProviderSettingsError, match="URL and slug"):
        await service.update(ProviderSettingsPatch(pulse_provider="kuma"))


@pytest.mark.asyncio
async def test_kuma_change_invalidates_pulse_cache() -> None:
    row = _row(
        pulse_provider="kuma",
        kuma_url="https://status.example.test",
        kuma_slug="flowvy",
    )
    service, _kuma, _beszel, redis = _service(row)

    await service.update(ProviderSettingsPatch(kuma_slug="flowvy-new"))

    redis.delete.assert_awaited_once_with(CACHE_KEY)


@pytest.mark.asyncio
async def test_enabled_target_is_validated_before_persistence() -> None:
    row = _row(
        pulse_provider="disabled",
        kuma_url="http://public.example.test",
        kuma_slug="flowvy",
    )
    service, kuma, _beszel, _redis = _service(row)
    kuma.validate_target = AsyncMock(
        side_effect=KumaError("Kuma target is invalid or not allowed")
    )

    with pytest.raises(ProviderSettingsError, match="invalid or not allowed"):
        await service.update(ProviderSettingsPatch(pulse_provider="kuma"))

    service._repo.update_partial.assert_not_awaited()


@pytest.mark.asyncio
async def test_unrelated_change_does_not_invalidate_pulse_cache() -> None:
    service, _kuma, _beszel, redis = _service(_row())

    await service.update(ProviderSettingsPatch(app_name="Flowvy"))

    redis.delete.assert_not_awaited()


@pytest.mark.asyncio
async def test_settings_response_exposes_typed_localized_content() -> None:
    service, _kuma, _beszel, _redis = _service(
        _row(
            content_locales={
                "en": {"invite_title": "Invite friends"},
                "ru": {"invite_title": "Позвать друзей"},
            },
        )
    )

    payload = (await service.get()).model_dump(by_alias=True)

    assert payload["contentLocales"]["en"]["inviteTitle"] == "Invite friends"
    assert payload["contentLocales"]["ru"]["inviteTitle"] == "Позвать друзей"
    assert "botInviteRequired" not in payload["contentTemplateVariables"]
    assert "botInviteMediaType" not in payload
    assert "supportUrl" not in payload
    assert payload["contentTemplateVariables"]["inviteShareText"] == ["appName", "code"]
    assert payload["contentTemplateVariables"]["inviteShareButtonText"] == ["appName"]
    assert payload["inviteSharePreviewMode"] == "auto"
    assert payload["inviteShareAllowUserChats"] is True
    assert payload["inviteShareAllowGroupChats"] is True
    assert payload["sponsorOfferTemplateVariables"] == ["appName"]


def test_public_branding_contains_only_resolved_operator_locale() -> None:
    user = SimpleNamespace(
        id=123,
        username="alice",
        full_name="Alice",
        role="user",
        is_active=True,
    )

    payload = build_user_response(
        user,
        _row(
            content_locales={
                "en": {"invite_title": "Invite friends"},
                "ru": {"invite_title": "Позвать друзей"},
            },
        ),
        "ru-RU",
    ).model_dump(by_alias=True)

    assert payload["branding"]["content"]["inviteTitle"] == "Позвать друзей"
    assert "supportUrl" not in payload["branding"]
    assert "contentLocales" not in payload["branding"]


@pytest.mark.asyncio
async def test_invite_share_audience_cannot_be_emptied_by_partial_patch() -> None:
    service, _kuma, _beszel, _redis = _service(
        _row(
            invite_share_allow_user_chats=True,
            invite_share_allow_group_chats=False,
        )
    )

    with pytest.raises(ProviderSettingsError, match="At least one"):
        await service.update(ProviderSettingsPatch(invite_share_allow_user_chats=False))

    service._repo.update_partial.assert_not_awaited()


@pytest.mark.asyncio
async def test_localized_settings_persist_as_one_typed_map_and_bridge_welcome() -> None:
    service, _kuma, _beszel, _redis = _service(_row())

    await service.update(
        ProviderSettingsPatch(
            content_locales={
                "en": {
                    "welcomeText": "Hello, {{appName}}",
                    "welcomeButtonText": "Open {{appName}}",
                    "inviteShareText": "Join {{appName}} with {{code}}",
                }
            }
        )
    )

    service._repo.update_partial.assert_awaited_once_with(
        {
            "content_locales": {
                "en": {
                    "welcome_text": "Hello, {{appName}}",
                    "welcome_button_text": "Open {{appName}}",
                    "invite_share_text": "Join {{appName}} with {{code}}",
                }
            },
            "welcome_text": "Hello, {{appName}}",
            "welcome_button_text": "Open {{appName}}",
        }
    )


def test_localized_content_rejects_unknown_template_placeholders() -> None:
    with pytest.raises(ValidationError, match="Unsupported placeholders"):
        ProviderSettingsPatch(content_locales={"en": {"inviteShareText": "Hello {{secret}}"}})


@pytest.mark.asyncio
async def test_connection_test_uses_injected_safe_client() -> None:
    row = _row(
        pulse_provider="kuma",
        kuma_url="https://status.example.test",
        kuma_slug="flowvy",
    )
    service, kuma, _beszel, _redis = _service(row)
    kuma.get_status_page = AsyncMock(return_value=object())

    result = await service.test_kuma()

    assert result.ok is True
    kuma.get_status_page.assert_awaited_once_with(row.kuma_url, row.kuma_slug)


@pytest.mark.asyncio
async def test_connection_test_returns_only_safe_client_error() -> None:
    row = _row(kuma_url="https://status.example.test", kuma_slug="flowvy")
    service, kuma, _beszel, _redis = _service(row)
    kuma.get_status_page = AsyncMock(side_effect=KumaError("Kuma connection failed"))

    result = await service.test_kuma()

    assert result.ok is False
    assert result.error == "Kuma connection failed"


@pytest.mark.asyncio
async def test_kuma_candidate_test_uses_unsaved_target_without_persistence() -> None:
    service, kuma, _beszel, redis = _service(_row())
    kuma.get_status_page = AsyncMock(return_value=object())
    candidate = KumaTestRequest(url="https://draft.example.test", slug="flowvy")

    result = await service.test_kuma_candidate(candidate.url, candidate.slug)

    assert result.ok is True
    kuma.get_status_page.assert_awaited_once_with(
        "https://draft.example.test",
        "flowvy",
    )
    service._repo.update_partial.assert_not_awaited()
    redis.delete.assert_not_awaited()


@pytest.mark.asyncio
async def test_enabling_beszel_requires_url_and_server_credentials() -> None:
    service, _kuma, beszel, _redis = _service(_row())

    with pytest.raises(ProviderSettingsError, match="Beszel URL"):
        await service.update(ProviderSettingsPatch(pulse_provider="beszel"))

    service._repo.get.return_value = _row(beszel_url="https://monitor.example.test")
    beszel.credentials_configured = False
    with pytest.raises(ProviderSettingsError, match="credentials"):
        await service.update(ProviderSettingsPatch(pulse_provider="beszel"))


@pytest.mark.asyncio
async def test_enabling_beszel_validates_target_before_persistence() -> None:
    row = _row(beszel_url="https://monitor.example.test")
    service, _kuma, beszel, _redis = _service(row)
    beszel.validate_target = AsyncMock(
        side_effect=BeszelError("Beszel target is invalid or not allowed")
    )

    with pytest.raises(ProviderSettingsError, match="invalid or not allowed"):
        await service.update(ProviderSettingsPatch(pulse_provider="beszel"))

    service._repo.update_partial.assert_not_awaited()


@pytest.mark.asyncio
async def test_beszel_change_invalidates_pulse_cache() -> None:
    service, _kuma, _beszel, redis = _service(_row())

    await service.update(ProviderSettingsPatch(beszel_url="https://monitor.example.test"))

    redis.delete.assert_awaited_once_with(CACHE_KEY)


@pytest.mark.asyncio
async def test_beszel_connection_test_returns_only_safe_error() -> None:
    row = _row(beszel_url="https://monitor.example.test")
    service, _kuma, beszel, _redis = _service(row)
    beszel.test_connection = AsyncMock(side_effect=BeszelError("Beszel authentication failed"))

    result = await service.test_beszel()

    assert result.ok is False
    assert result.error == "Beszel authentication failed"


@pytest.mark.asyncio
async def test_beszel_candidate_test_uses_unsaved_target_without_persistence() -> None:
    service, _kuma, beszel, redis = _service(_row())
    beszel.test_connection = AsyncMock(return_value=None)
    candidate = BeszelTestRequest(url="https://draft.example.test")

    result = await service.test_beszel_candidate(candidate.url)

    assert result.ok is True
    beszel.test_connection.assert_awaited_once_with("https://draft.example.test")
    service._repo.update_partial.assert_not_awaited()
    redis.delete.assert_not_awaited()


@pytest.mark.asyncio
async def test_settings_response_exposes_only_credential_presence() -> None:
    service, _kuma, beszel, _redis = _service(_row(beszel_url="https://monitor.example.test"))
    beszel.credentials_configured = True
    service._tribute.credentials_configured = True

    payload = (await service.get()).model_dump(by_alias=True)

    assert payload["beszelCredentialsConfigured"] is True
    assert payload["tributeCredentialsConfigured"] is True
    assert "beszelEmail" not in payload
    assert "beszelPassword" not in payload
    assert "tributeApiKey" not in payload


@pytest.mark.asyncio
async def test_tribute_connection_test_is_read_only_and_returns_safe_status() -> None:
    service, _kuma, _beszel, redis = _service(_row())
    service._tribute.test_connection = AsyncMock(return_value=None)

    result = await service.test_tribute()

    assert result.ok is True
    service._tribute.test_connection.assert_awaited_once_with()
    service._repo.update_partial.assert_not_awaited()
    redis.delete.assert_not_awaited()


@pytest.mark.asyncio
async def test_tribute_connection_test_hides_transport_details_from_response_shape() -> None:
    service, _kuma, _beszel, _redis = _service(_row())
    service._tribute.test_connection = AsyncMock(
        side_effect=TributeError("Tribute connection timed out")
    )

    result = await service.test_tribute()

    assert result.ok is False
    assert result.error == "Tribute connection timed out"
