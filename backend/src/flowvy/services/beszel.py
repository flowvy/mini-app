"""Safe read-only client for the Beszel v0.18.7 PocketBase API."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
from pydantic import ValidationError

from flowvy.beszel_target import (
    BeszelTargetError,
    BeszelTargetPolicy,
    PreparedBeszelRequest,
)
from flowvy.schemas.beszel import (
    BeszelAuthResponse,
    BeszelSnapshot,
    BeszelStatsPage,
    BeszelSystem,
    BeszelSystemsPage,
    BeszelSystemStat,
)

AUTH_PATH = "/api/collections/users/auth-with-password"
SYSTEMS_PATH = "/api/collections/systems/records"
STATS_PATH = "/api/collections/system_stats/records"
PAGE_SIZE = 500
MAX_SYSTEMS = 200
MAX_STATS = 25_000
MAX_PAGES = 50


class BeszelError(Exception):
    """A safe, user-displayable Beszel integration failure."""

    def __init__(self, detail: str, *, status_code: int | None = None) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


class BeszelClient:
    """Authenticate, fetch, bound, and validate Beszel monitoring data."""

    def __init__(
        self,
        http: httpx.AsyncClient,
        target_policy: BeszelTargetPolicy,
        *,
        email: str,
        password: str,
        max_response_bytes: int,
    ) -> None:
        self._http = http
        self._target_policy = target_policy
        self._email = email.strip()
        self._password = password
        self._max_response_bytes = max_response_bytes

    @property
    def credentials_configured(self) -> bool:
        """Return only whether both server-side credentials are present."""
        return bool(self._email and self._password)

    async def validate_target(self, url: str) -> None:
        """Resolve and validate a target without sending credentials."""
        try:
            await self._target_policy.prepare(url, AUTH_PATH)
        except BeszelTargetError as exc:
            raise BeszelError("Beszel target is invalid or not allowed") from exc

    async def test_connection(self, url: str) -> None:
        """Authenticate as the configured user and verify systems read access."""
        token = await self._authenticate(url)
        await self._get_systems_page(url, token, page=1, per_page=1)

    async def get_snapshot(
        self,
        url: str,
        *,
        now: datetime | None = None,
    ) -> BeszelSnapshot:
        """Fetch systems plus 40-minute and 24-hour availability samples."""
        current_time = now or datetime.now(UTC)
        if current_time.tzinfo is None:
            current_time = current_time.replace(tzinfo=UTC)
        else:
            current_time = current_time.astimezone(UTC)

        token = await self._authenticate(url)
        systems = await self._list_systems(url, token)
        minute_stats, daily_stats = await asyncio.gather(
            self._list_stats(
                url,
                token,
                stat_type="1m",
                since=current_time - timedelta(minutes=40),
            ),
            self._list_stats(
                url,
                token,
                stat_type="20m",
                since=current_time - timedelta(hours=24),
            ),
        )
        return BeszelSnapshot(
            captured_at=current_time,
            systems=systems,
            minute_stats=minute_stats,
            daily_stats=daily_stats,
        )

    async def _authenticate(self, url: str) -> str:
        if not self.credentials_configured:
            raise BeszelError("Beszel credentials are not configured")
        body = await self._request(
            url,
            "POST",
            AUTH_PATH,
            json={"identity": self._email, "password": self._password},
        )
        try:
            return BeszelAuthResponse.model_validate_json(body).token
        except (ValidationError, ValueError) as exc:
            raise BeszelError("Beszel returned an invalid authentication response") from exc

    async def _list_systems(self, url: str, token: str) -> list[BeszelSystem]:
        first = await self._get_systems_page(url, token, page=1, per_page=PAGE_SIZE)
        if first.total_items > MAX_SYSTEMS or first.total_pages > MAX_PAGES:
            raise BeszelError("Beszel returned too many systems")
        items = list(first.items)
        for page in range(2, first.total_pages + 1):
            result = await self._get_systems_page(url, token, page=page, per_page=PAGE_SIZE)
            items.extend(result.items)
        if len(items) != first.total_items:
            raise BeszelError("Beszel returned an inconsistent systems response")
        return items

    async def _get_systems_page(
        self,
        url: str,
        token: str,
        *,
        page: int,
        per_page: int,
    ) -> BeszelSystemsPage:
        body = await self._request(
            url,
            "GET",
            SYSTEMS_PATH,
            token=token,
            params={
                "page": page,
                "perPage": per_page,
                "sort": "name",
                "fields": "id,name,status,created",
            },
        )
        try:
            return BeszelSystemsPage.model_validate_json(body)
        except (ValidationError, ValueError) as exc:
            raise BeszelError("Beszel returned an invalid systems response") from exc

    async def _list_stats(
        self,
        url: str,
        token: str,
        *,
        stat_type: str,
        since: datetime,
    ) -> list[BeszelSystemStat]:
        timestamp = since.astimezone(UTC).strftime("%Y-%m-%d %H:%M:%S.%fZ")
        common_params: dict[str, str | int] = {
            "perPage": PAGE_SIZE,
            "sort": "created",
            "fields": "system,created",
            "filter": f'created >= "{timestamp}" && type = "{stat_type}"',
        }
        first = await self._get_stats_page(
            url,
            token,
            params={**common_params, "page": 1},
        )
        if first.total_items > MAX_STATS or first.total_pages > MAX_PAGES:
            raise BeszelError("Beszel returned too many statistics")
        items = list(first.items)
        for page in range(2, first.total_pages + 1):
            result = await self._get_stats_page(
                url,
                token,
                params={**common_params, "page": page},
            )
            items.extend(result.items)
        if len(items) != first.total_items:
            raise BeszelError("Beszel returned an inconsistent statistics response")
        return items

    async def _get_stats_page(
        self,
        url: str,
        token: str,
        *,
        params: dict[str, str | int],
    ) -> BeszelStatsPage:
        body = await self._request(
            url,
            "GET",
            STATS_PATH,
            token=token,
            params=params,
        )
        try:
            return BeszelStatsPage.model_validate_json(body)
        except (ValidationError, ValueError) as exc:
            raise BeszelError("Beszel returned an invalid statistics response") from exc

    async def _request(
        self,
        url: str,
        method: str,
        path: str,
        *,
        token: str | None = None,
        params: dict[str, str | int] | None = None,
        json: dict[str, Any] | None = None,
    ) -> bytes:
        try:
            requests = await self._target_policy.prepare(url, path, params=params)
        except BeszelTargetError as exc:
            raise BeszelError("Beszel target is invalid or not allowed") from exc

        last_connection_error: Exception | None = None
        for request in requests:
            try:
                return await self._send(request, method, token=token, json=json)
            except (httpx.ConnectError, httpx.ConnectTimeout) as exc:
                last_connection_error = exc
            except httpx.TimeoutException as exc:
                raise BeszelError("Beszel connection timed out") from exc
            except httpx.NetworkError as exc:
                raise BeszelError("Beszel connection failed") from exc
        raise BeszelError("Beszel connection failed") from last_connection_error

    async def _send(
        self,
        request: PreparedBeszelRequest,
        method: str,
        *,
        token: str | None,
        json: dict[str, Any] | None,
    ) -> bytes:
        extensions: dict[str, str] = {}
        if request.sni_hostname is not None:
            extensions["sni_hostname"] = request.sni_hostname
        headers = {"Host": request.host_header, "Accept": "application/json"}
        if token is not None:
            headers["Authorization"] = token
        async with self._http.stream(
            method,
            request.url,
            headers=headers,
            json=json,
            extensions=extensions,
            follow_redirects=False,
        ) as response:
            if response.status_code != httpx.codes.OK:
                raise BeszelError(
                    f"Beszel returned HTTP {response.status_code}",
                    status_code=response.status_code,
                )
            content_length = response.headers.get("Content-Length")
            if content_length is not None:
                try:
                    declared_size = int(content_length)
                except ValueError as exc:
                    raise BeszelError("Beszel returned an invalid response") from exc
                if declared_size > self._max_response_bytes:
                    raise BeszelError("Beszel response is too large")

            body = bytearray()
            async for chunk in response.aiter_bytes():
                if len(body) + len(chunk) > self._max_response_bytes:
                    raise BeszelError("Beszel response is too large")
                body.extend(chunk)
            return bytes(body)
