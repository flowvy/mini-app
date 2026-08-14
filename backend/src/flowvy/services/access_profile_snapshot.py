"""Canonical typed access-profile snapshots shared by grant workflows."""

from __future__ import annotations

import uuid

from flowvy.models.access_profile import AccessProfile
from flowvy.schemas.registration import AccessProfileInput


def access_profile_input(profile: AccessProfile) -> AccessProfileInput:
    """Convert one persisted profile through the public validation contract."""
    return AccessProfileInput(
        name=profile.name,
        description=profile.description,
        validity_mode=profile.validity_mode,  # type: ignore[arg-type]
        validity_days=profile.validity_days,
        fixed_expire_at=profile.fixed_expire_at,
        traffic_limit_bytes=profile.traffic_limit_bytes,
        traffic_limit_strategy=profile.traffic_limit_strategy,  # type: ignore[arg-type]
        hwid_device_limit=profile.hwid_device_limit,
        tag=profile.tag,
        status=profile.status,  # type: ignore[arg-type]
        internal_squad_uuids=[uuid.UUID(item) for item in profile.internal_squad_uuids],
        external_squad_uuid=profile.external_squad_uuid,
    )


def access_profile_snapshot(profile: AccessProfile) -> dict[str, object]:
    """Return the stable JSON representation captured by durable decisions."""
    return access_profile_input(profile).model_dump(mode="json")


__all__ = ["access_profile_input", "access_profile_snapshot"]
