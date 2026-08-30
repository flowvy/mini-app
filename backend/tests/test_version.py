"""Release-version consistency tests for runtime surfaces."""

from __future__ import annotations

from importlib.metadata import version

from flowvy import __version__
from flowvy.api.factory import create_app
from flowvy.config import Settings
from flowvy.schemas.provider_settings import ProviderSettingsResponse


def test_runtime_surfaces_use_installed_package_version() -> None:
    package_version = version("flowvy")

    assert __version__ == package_version
    assert Settings(_env_file=None).version == package_version
    assert create_app().version == package_version
    assert ProviderSettingsResponse.model_fields["flowvy_version"].default == package_version
