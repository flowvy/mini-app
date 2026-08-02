"""Shared origin validation and DNS pinning for outbound provider requests."""

from __future__ import annotations

import asyncio
import ipaddress
import socket
from collections.abc import Awaitable, Callable, Mapping, Sequence
from dataclasses import dataclass
from urllib.parse import SplitResult, urlsplit, urlunsplit

import httpx

ALWAYS_BLOCKED_HOSTS = frozenset({"metadata", "metadata.google.internal"})


class OriginTargetError(ValueError):
    """Raised when an outbound provider origin is unsafe or malformed."""


Resolver = Callable[[str, int], Awaitable[Sequence[str]]]


@dataclass(frozen=True)
class PreparedOriginRequest:
    """One request pinned to an already validated network address."""

    url: httpx.URL
    host_header: str
    sni_hostname: str | None


def normalize_origin_host(value: str, *, provider: str) -> str:
    """Normalize one host without accepting wildcard or credential syntax."""
    candidate = value.strip().rstrip(".").lower()
    if not candidate or any(char.isspace() for char in candidate):
        raise OriginTargetError(f"{provider} allow-list host is empty or malformed")
    if any(char in candidate for char in "*/:@[]\\"):
        try:
            return str(ipaddress.ip_address(candidate.strip("[]")))
        except ValueError as exc:
            raise OriginTargetError(f"{provider} allow-list entries must be exact hosts") from exc
    try:
        return str(ipaddress.ip_address(candidate))
    except ValueError:
        try:
            return candidate.encode("idna").decode("ascii")
        except UnicodeError as exc:
            raise OriginTargetError(f"{provider} allow-list host is malformed") from exc


def split_origin(value: str, *, provider: str) -> tuple[str, SplitResult, str, int]:
    """Parse an origin-only URL into normalized connection components."""
    raw = value.strip()
    if not raw or "\\" in raw or any(ord(char) < 33 for char in raw):
        raise OriginTargetError(f"{provider} URL is malformed")
    try:
        parsed = urlsplit(raw)
        port = parsed.port
    except ValueError as exc:
        raise OriginTargetError(f"{provider} URL is malformed") from exc
    scheme = parsed.scheme.lower()
    if scheme not in {"http", "https"}:
        raise OriginTargetError(f"{provider} URL must use http or https")
    if parsed.username is not None or parsed.password is not None:
        raise OriginTargetError(f"{provider} URL must not contain credentials")
    if parsed.query or parsed.fragment or parsed.path not in {"", "/"}:
        raise OriginTargetError(
            f"{provider} URL must be an origin without path, query, or fragment"
        )
    if not parsed.hostname or "%" in parsed.netloc:
        raise OriginTargetError(f"{provider} URL must contain a valid host")
    host = normalize_origin_host(parsed.hostname, provider=provider)
    if host in ALWAYS_BLOCKED_HOSTS:
        raise OriginTargetError(f"{provider} target is not allowed")
    return scheme, parsed, host, port or (443 if scheme == "https" else 80)


def normalize_origin(value: str, *, provider: str) -> str:
    """Return a canonical provider origin after strict syntax validation."""
    scheme, parsed, host, port = split_origin(value, provider=provider)
    display_host = f"[{host}]" if ":" in host else host
    default_port = 443 if scheme == "https" else 80
    netloc = (
        display_host if port == default_port and parsed.port is None else f"{display_host}:{port}"
    )
    return urlunsplit((scheme, netloc, "", "", ""))


async def resolve_host(host: str, port: int) -> Sequence[str]:
    """Resolve all stream addresses without blocking the event loop."""
    infos = await asyncio.get_running_loop().getaddrinfo(
        host,
        port,
        family=socket.AF_UNSPEC,
        type=socket.SOCK_STREAM,
    )
    return tuple(dict.fromkeys(info[4][0] for info in infos))


class SafeOriginPolicy:
    """Resolve, validate, and pin one provider origin to prevent DNS rebinding."""

    def __init__(
        self,
        provider: str,
        allowed_private_origins: Sequence[str] = (),
        *,
        resolver: Resolver = resolve_host,
    ) -> None:
        self._provider = provider
        self._allowed_private_origins = frozenset(
            normalize_origin(origin, provider=provider) for origin in allowed_private_origins
        )
        self._resolver = resolver

    async def prepare(
        self,
        base_url: str,
        path: str,
        *,
        params: Mapping[str, str | int] | None = None,
    ) -> tuple[PreparedOriginRequest, ...]:
        """Build one safe request per validated address, preserving DNS order."""
        if not path.startswith("/") or path.startswith("//") or "?" in path or "#" in path:
            raise OriginTargetError(f"{self._provider} request path is malformed")

        normalized_url = normalize_origin(base_url, provider=self._provider)
        scheme, _parsed, host, port = split_origin(
            normalized_url,
            provider=self._provider,
        )
        allow_private = normalized_url in self._allowed_private_origins
        if scheme != "https" and not allow_private:
            raise OriginTargetError(f"Public {self._provider} targets must use https")

        try:
            literal = ipaddress.ip_address(host)
            raw_addresses: Sequence[str] = (str(literal),)
        except ValueError:
            try:
                raw_addresses = await self._resolver(host, port)
            except (OSError, socket.gaierror) as exc:
                raise OriginTargetError(f"{self._provider} target could not be resolved") from exc

        addresses: list[str] = []
        for raw_address in raw_addresses:
            try:
                address = ipaddress.ip_address(raw_address)
            except ValueError as exc:
                raise OriginTargetError(
                    f"{self._provider} target resolved to an invalid address"
                ) from exc
            if address.is_unspecified or address.is_multicast or address.is_link_local:
                raise OriginTargetError(f"{self._provider} target resolved to a forbidden address")
            if not address.is_global and not allow_private:
                raise OriginTargetError(
                    f"{self._provider} target resolved to a non-public address"
                )
            normalized_address = str(address)
            if normalized_address not in addresses:
                addresses.append(normalized_address)
        if not addresses:
            raise OriginTargetError(f"{self._provider} target did not resolve to an address")

        display_host = f"[{host}]" if ":" in host else host
        default_port = 443 if scheme == "https" else 80
        host_header = display_host if port == default_port else f"{display_host}:{port}"
        return tuple(
            PreparedOriginRequest(
                url=httpx.URL(
                    scheme=scheme,
                    host=address,
                    port=port,
                    path=path,
                    params=params,
                ),
                host_header=host_header,
                sni_hostname=host if scheme == "https" else None,
            )
            for address in addresses
        )
