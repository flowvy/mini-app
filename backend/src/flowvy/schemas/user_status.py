"""Shared Remnawave user-status contracts and inbound normalization."""

from __future__ import annotations

from typing import Literal, cast

ProviderUserStatus = Literal["ACTIVE", "DISABLED", "LIMITED", "EXPIRED"]
UserStatus = Literal["ACTIVE", "DISABLED", "LIMITED", "EXPIRED", "UNKNOWN"]

PROVIDER_USER_STATUSES: tuple[ProviderUserStatus, ...] = (
    "ACTIVE",
    "DISABLED",
    "LIMITED",
    "EXPIRED",
)
_PROVIDER_USER_STATUS_SET = frozenset(PROVIDER_USER_STATUSES)


def normalize_user_status(value: object) -> UserStatus:
    """Collapse an absent or future provider status into one safe BFF value."""
    if isinstance(value, str) and value in _PROVIDER_USER_STATUS_SET:
        return cast("ProviderUserStatus", value)
    return "UNKNOWN"


__all__ = [
    "PROVIDER_USER_STATUSES",
    "ProviderUserStatus",
    "UserStatus",
    "normalize_user_status",
]
