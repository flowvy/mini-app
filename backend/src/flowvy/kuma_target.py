"""Validated and DNS-pinned Uptime Kuma request targets."""

from __future__ import annotations

import re
from collections.abc import Sequence

from flowvy.origin_target import (
    OriginTargetError,
    PreparedOriginRequest,
    Resolver,
    SafeOriginPolicy,
    normalize_origin,
    normalize_origin_host,
    resolve_host,
)

KUMA_SLUG_PATTERN = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,253}[A-Za-z0-9])?$")


class KumaTargetError(ValueError):
    """Raised when a configured Kuma target is unsafe or malformed."""


PreparedKumaRequest = PreparedOriginRequest


def normalize_kuma_host(value: str) -> str:
    """Normalize one host without accepting wildcard or credential syntax."""
    try:
        return normalize_origin_host(value, provider="Kuma")
    except OriginTargetError as exc:
        raise KumaTargetError(str(exc)) from exc


def normalize_kuma_base_url(value: str) -> str:
    """Return a canonical Kuma origin after strict syntax validation."""
    try:
        return normalize_origin(value, provider="Kuma")
    except OriginTargetError as exc:
        raise KumaTargetError(str(exc)) from exc


def normalize_kuma_slug(value: str) -> str:
    """Validate the public status-page slug used as one path segment."""
    slug = value.strip().lower()
    if not KUMA_SLUG_PATTERN.fullmatch(slug) or "--" in slug:
        raise KumaTargetError("Kuma slug must be alphanumeric with single internal dashes")
    return slug


class KumaTargetPolicy:
    """Resolve, validate, and pin Kuma requests to prevent DNS rebinding."""

    def __init__(
        self,
        allowed_private_origins: Sequence[str] = (),
        *,
        resolver: Resolver = resolve_host,
    ) -> None:
        try:
            self._policy = SafeOriginPolicy(
                "Kuma",
                allowed_private_origins,
                resolver=resolver,
            )
        except OriginTargetError as exc:
            raise KumaTargetError(str(exc)) from exc

    async def prepare(
        self,
        base_url: str,
        slug: str,
        *,
        heartbeat: bool,
    ) -> tuple[PreparedKumaRequest, ...]:
        """Build one safe request per validated address, preserving DNS order."""
        normalized_slug = normalize_kuma_slug(slug)
        path = (
            f"/api/status-page/heartbeat/{normalized_slug}"
            if heartbeat
            else f"/api/status-page/{normalized_slug}"
        )
        try:
            return await self._policy.prepare(base_url, path)
        except OriginTargetError as exc:
            raise KumaTargetError(str(exc)) from exc
