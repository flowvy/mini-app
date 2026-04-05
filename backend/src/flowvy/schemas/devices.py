"""BFF device response for the frontend Devices page."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class DeviceResponse(BaseModel):
    """Single device in the BFF response."""

    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=to_camel,
        serialize_by_alias=True,
    )

    hwid: str
    platform: str | None
    os_version: str | None
    device_model: str | None
    created_at: int


class DevicesResponse(BaseModel):
    """Aggregated devices data sent to the Mini App."""

    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=to_camel,
        serialize_by_alias=True,
    )

    devices: list[DeviceResponse]
    total: int
    limit: int | None
