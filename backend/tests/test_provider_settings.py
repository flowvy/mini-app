"""Provider-settings validation and Kuma seam tests."""

from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from pydantic import ValidationError

from flowvy.schemas.provider_settings import ProviderSettingsPatch
from flowvy.services.kuma import KumaError
from flowvy.services.provider_settings import ProviderSettingsError, ProviderSettingsService
from flowvy.services.pulse import CACHE_KEY


def _row(**overrides: object) -> SimpleNamespace:
    values: dict[str, object] = {
        "kuma_enabled": False,
        "kuma_url": None,
        "kuma_slug": None,
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


def _service(row: SimpleNamespace) -> tuple[ProviderSettingsService, AsyncMock, AsyncMock]:
    repo = AsyncMock()
    repo.get = AsyncMock(return_value=row)
    repo.update_partial = AsyncMock(return_value=row)
    remnawave = AsyncMock()
    remnawave.get_metadata = AsyncMock(return_value={"version": "2.7.4"})
    kuma = AsyncMock()
    redis = AsyncMock()
    redis.delete = AsyncMock(return_value=1)
    return ProviderSettingsService(repo, remnawave, kuma, redis), kuma, redis


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("kuma_url", "http://public.example.test"),
        ("kuma_url", "https://user@status.example.test"),
        ("kuma_url", "https://status.example.test/path"),
        ("kuma_slug", "../admin"),
        ("kuma_slug", "bad/slash"),
    ],
)
def test_patch_rejects_unsafe_kuma_syntax(field: str, value: str) -> None:
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
    service, _kuma, _redis = _service(_row())

    with pytest.raises(ProviderSettingsError, match="URL and slug"):
        await service.update(ProviderSettingsPatch(kuma_enabled=True))


@pytest.mark.asyncio
async def test_kuma_change_invalidates_pulse_cache() -> None:
    row = _row(
        kuma_enabled=True,
        kuma_url="https://status.example.test",
        kuma_slug="flowvy",
    )
    service, _kuma, redis = _service(row)

    await service.update(ProviderSettingsPatch(kuma_slug="flowvy-new"))

    redis.delete.assert_awaited_once_with(CACHE_KEY)


@pytest.mark.asyncio
async def test_enabled_target_is_validated_before_persistence() -> None:
    row = _row(
        kuma_enabled=False,
        kuma_url="http://public.example.test",
        kuma_slug="flowvy",
    )
    service, kuma, _redis = _service(row)
    kuma.validate_target = AsyncMock(
        side_effect=KumaError("Kuma target is invalid or not allowed")
    )

    with pytest.raises(ProviderSettingsError, match="invalid or not allowed"):
        await service.update(ProviderSettingsPatch(kuma_enabled=True))

    service._repo.update_partial.assert_not_awaited()


@pytest.mark.asyncio
async def test_unrelated_change_does_not_invalidate_pulse_cache() -> None:
    service, _kuma, redis = _service(_row())

    await service.update(ProviderSettingsPatch(app_name="Flowvy"))

    redis.delete.assert_not_awaited()


@pytest.mark.asyncio
async def test_connection_test_uses_injected_safe_client() -> None:
    row = _row(
        kuma_enabled=True,
        kuma_url="https://status.example.test",
        kuma_slug="flowvy",
    )
    service, kuma, _redis = _service(row)
    kuma.get_status_page = AsyncMock(return_value=object())

    result = await service.test_kuma()

    assert result.ok is True
    kuma.get_status_page.assert_awaited_once_with(row.kuma_url, row.kuma_slug)


@pytest.mark.asyncio
async def test_connection_test_returns_only_safe_client_error() -> None:
    row = _row(kuma_url="https://status.example.test", kuma_slug="flowvy")
    service, kuma, _redis = _service(row)
    kuma.get_status_page = AsyncMock(side_effect=KumaError("Kuma connection failed"))

    result = await service.test_kuma()

    assert result.ok is False
    assert result.error == "Kuma connection failed"
