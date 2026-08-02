"""Validated and DNS-pinned Beszel Hub request targets."""

from __future__ import annotations

from collections.abc import Mapping, Sequence

from flowvy.origin_target import (
    OriginTargetError,
    PreparedOriginRequest,
    Resolver,
    SafeOriginPolicy,
    normalize_origin,
    resolve_host,
)


class BeszelTargetError(ValueError):
    """Raised when a configured Beszel target is unsafe or malformed."""


PreparedBeszelRequest = PreparedOriginRequest


def normalize_beszel_base_url(value: str) -> str:
    """Return a canonical Beszel origin after strict syntax validation."""
    try:
        return normalize_origin(value, provider="Beszel")
    except OriginTargetError as exc:
        raise BeszelTargetError(str(exc)) from exc


class BeszelTargetPolicy:
    """Resolve, validate, and pin Beszel requests to prevent DNS rebinding."""

    def __init__(
        self,
        allowed_private_origins: Sequence[str] = (),
        *,
        resolver: Resolver = resolve_host,
    ) -> None:
        try:
            self._policy = SafeOriginPolicy(
                "Beszel",
                allowed_private_origins,
                resolver=resolver,
            )
        except OriginTargetError as exc:
            raise BeszelTargetError(str(exc)) from exc

    async def prepare(
        self,
        base_url: str,
        path: str,
        *,
        params: Mapping[str, str | int] | None = None,
    ) -> tuple[PreparedBeszelRequest, ...]:
        """Build safe Beszel requests for one fixed API path."""
        try:
            return await self._policy.prepare(base_url, path, params=params)
        except OriginTargetError as exc:
            raise BeszelTargetError(str(exc)) from exc
