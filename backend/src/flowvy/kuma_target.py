"""Validated and DNS-pinned Uptime Kuma request targets."""

from __future__ import annotations

import asyncio
import ipaddress
import re
import socket
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass
from urllib.parse import SplitResult, urlsplit, urlunsplit

import httpx

KUMA_SLUG_PATTERN = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,253}[A-Za-z0-9])?$")
ALWAYS_BLOCKED_HOSTS = frozenset(
    {
        "metadata",
        "metadata.google.internal",
    }
)


class KumaTargetError(ValueError):
    """Raised when a configured Kuma target is unsafe or malformed."""


Resolver = Callable[[str, int], Awaitable[Sequence[str]]]


@dataclass(frozen=True)
class PreparedKumaRequest:
    """One request pinned to an already validated network address."""

    url: httpx.URL
    host_header: str
    sni_hostname: str | None


def normalize_kuma_host(value: str) -> str:
    """Normalize one host without accepting wildcard or credential syntax."""
    candidate = value.strip().rstrip(".").lower()
    if not candidate or any(char.isspace() for char in candidate):
        raise KumaTargetError("Kuma allow-list host is empty or malformed")
    if any(char in candidate for char in "*/:@[]\\"):
        try:
            return str(ipaddress.ip_address(candidate.strip("[]")))
        except ValueError as exc:
            raise KumaTargetError("Kuma allow-list entries must be exact hosts") from exc
    try:
        return str(ipaddress.ip_address(candidate))
    except ValueError:
        try:
            return candidate.encode("idna").decode("ascii")
        except UnicodeError as exc:
            raise KumaTargetError("Kuma allow-list host is malformed") from exc


def _split_kuma_url(value: str) -> tuple[str, SplitResult, str, int]:
    raw = value.strip()
    if not raw or "\\" in raw or any(ord(char) < 33 for char in raw):
        raise KumaTargetError("Kuma URL is malformed")
    try:
        parsed = urlsplit(raw)
        port = parsed.port
    except ValueError as exc:
        raise KumaTargetError("Kuma URL is malformed") from exc
    scheme = parsed.scheme.lower()
    if scheme not in {"http", "https"}:
        raise KumaTargetError("Kuma URL must use http or https")
    if parsed.username is not None or parsed.password is not None:
        raise KumaTargetError("Kuma URL must not contain credentials")
    if parsed.query or parsed.fragment or parsed.path not in {"", "/"}:
        raise KumaTargetError("Kuma URL must be an origin without path, query, or fragment")
    if not parsed.hostname or "%" in parsed.netloc:
        raise KumaTargetError("Kuma URL must contain a valid host")
    host = normalize_kuma_host(parsed.hostname)
    if host in ALWAYS_BLOCKED_HOSTS:
        raise KumaTargetError("Kuma target is not allowed")
    return scheme, parsed, host, port or (443 if scheme == "https" else 80)


def normalize_kuma_base_url(value: str) -> str:
    """Return a canonical Kuma origin after strict syntax validation."""
    scheme, parsed, host, port = _split_kuma_url(value)
    display_host = f"[{host}]" if ":" in host else host
    default_port = 443 if scheme == "https" else 80
    netloc = (
        display_host if port == default_port and parsed.port is None else f"{display_host}:{port}"
    )
    return urlunsplit((scheme, netloc, "", "", ""))


def normalize_kuma_slug(value: str) -> str:
    """Validate the public status-page slug used as one path segment."""
    slug = value.strip().lower()
    if not KUMA_SLUG_PATTERN.fullmatch(slug) or "--" in slug:
        raise KumaTargetError("Kuma slug must be alphanumeric with single internal dashes")
    return slug


async def resolve_host(host: str, port: int) -> Sequence[str]:
    """Resolve all stream addresses without blocking the event loop."""
    infos = await asyncio.get_running_loop().getaddrinfo(
        host,
        port,
        family=socket.AF_UNSPEC,
        type=socket.SOCK_STREAM,
    )
    return tuple(dict.fromkeys(info[4][0] for info in infos))


class KumaTargetPolicy:
    """Resolve, validate, and pin Kuma requests to prevent DNS rebinding."""

    def __init__(
        self,
        allowed_private_origins: Sequence[str] = (),
        *,
        resolver: Resolver = resolve_host,
    ) -> None:
        self._allowed_private_origins = frozenset(
            normalize_kuma_base_url(origin) for origin in allowed_private_origins
        )
        self._resolver = resolver

    async def prepare(
        self,
        base_url: str,
        slug: str,
        *,
        heartbeat: bool,
    ) -> tuple[PreparedKumaRequest, ...]:
        """Build one safe request per validated address, preserving DNS order."""
        normalized_url = normalize_kuma_base_url(base_url)
        normalized_slug = normalize_kuma_slug(slug)
        scheme, _parsed, host, port = _split_kuma_url(normalized_url)
        allow_private = normalized_url in self._allowed_private_origins
        if scheme != "https" and not allow_private:
            raise KumaTargetError("Public Kuma targets must use https")

        try:
            literal = ipaddress.ip_address(host)
            raw_addresses: Sequence[str] = (str(literal),)
        except ValueError:
            try:
                raw_addresses = await self._resolver(host, port)
            except (OSError, socket.gaierror) as exc:
                raise KumaTargetError("Kuma target could not be resolved") from exc

        addresses: list[str] = []
        for raw_address in raw_addresses:
            try:
                address = ipaddress.ip_address(raw_address)
            except ValueError as exc:
                raise KumaTargetError("Kuma target resolved to an invalid address") from exc
            if address.is_unspecified or address.is_multicast or address.is_link_local:
                raise KumaTargetError("Kuma target resolved to a forbidden address")
            if not address.is_global and not allow_private:
                raise KumaTargetError("Kuma target resolved to a non-public address")
            normalized_address = str(address)
            if normalized_address not in addresses:
                addresses.append(normalized_address)
        if not addresses:
            raise KumaTargetError("Kuma target did not resolve to an address")

        path = (
            f"/api/status-page/heartbeat/{normalized_slug}"
            if heartbeat
            else f"/api/status-page/{normalized_slug}"
        )
        display_host = f"[{host}]" if ":" in host else host
        default_port = 443 if scheme == "https" else 80
        host_header = display_host if port == default_port else f"{display_host}:{port}"
        return tuple(
            PreparedKumaRequest(
                url=httpx.URL(
                    scheme=scheme,
                    host=address,
                    port=port,
                    path=path,
                ),
                host_header=host_header,
                sni_hostname=host if scheme == "https" else None,
            )
            for address in addresses
        )
