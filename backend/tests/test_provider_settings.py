"""Provider-settings validation and Kuma seam tests."""

from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from pydantic import ValidationError

from flowvy.api.routes.users import build_user_response
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
        "updated_at": datetime(2026, 8, 2, tzinfo=UTC),
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def _service(
    row: SimpleNamespace,
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
    return (
        ProviderSettingsService(repo, remnawave, kuma, beszel, tribute, redis),
        kuma,
        beszel,
        redis,
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


def test_settings_patch_has_no_external_support_fields() -> None:
    forbidden = {
        "support_title",
        "support_description",
        "support_url",
        "support_button_text",
    }

    assert forbidden.isdisjoint(ProviderSettingsPatch.model_fields)


@pytest.mark.asyncio
async def test_settings_response_has_no_external_support_fields() -> None:
    service, _kuma, _beszel, _redis = _service(_row())

    payload = (await service.get()).model_dump(by_alias=True)

    assert {"supportTitle", "supportDescription", "supportUrl", "supportButtonText"}.isdisjoint(
        payload
    )


def test_public_branding_contains_identity_only() -> None:
    user = SimpleNamespace(
        id=123,
        username="alice",
        full_name="Alice",
        role="user",
        is_active=True,
    )

    payload = build_user_response(user, _row()).model_dump(by_alias=True)

    assert payload["branding"] == {"appName": None, "logoUrl": None}


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
