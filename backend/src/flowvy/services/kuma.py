"""Safe HTTP client for the Uptime Kuma public status-page API."""

from __future__ import annotations

import httpx
from pydantic import ValidationError

from flowvy.kuma_target import KumaTargetError, KumaTargetPolicy, PreparedKumaRequest
from flowvy.schemas.kuma import KumaHeartbeatPage, KumaStatusPage


class KumaError(Exception):
    """A safe, user-displayable Kuma integration failure."""

    def __init__(self, detail: str, *, status_code: int | None = None) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


class UptimeKumaClient:
    """Resolve, pin, bound, and validate all Kuma responses."""

    def __init__(
        self,
        http: httpx.AsyncClient,
        target_policy: KumaTargetPolicy,
        *,
        max_response_bytes: int,
    ) -> None:
        self._http = http
        self._target_policy = target_policy
        self._max_response_bytes = max_response_bytes

    async def validate_target(self, url: str, slug: str) -> None:
        """Resolve and validate a target without sending an HTTP request."""
        try:
            await self._target_policy.prepare(url, slug, heartbeat=False)
        except KumaTargetError as exc:
            raise KumaError("Kuma target is invalid or not allowed") from exc

    async def get_status_page(self, url: str, slug: str) -> KumaStatusPage:
        """Fetch and validate status-page groups and incidents."""
        body = await self._get(url, slug, heartbeat=False)
        try:
            return KumaStatusPage.model_validate_json(body)
        except (ValidationError, ValueError) as exc:
            raise KumaError("Kuma returned an invalid status-page response") from exc

    async def get_heartbeats(self, url: str, slug: str) -> KumaHeartbeatPage:
        """Fetch and validate heartbeat history and uptime percentages."""
        body = await self._get(url, slug, heartbeat=True)
        try:
            return KumaHeartbeatPage.model_validate_json(body)
        except (ValidationError, ValueError) as exc:
            raise KumaError("Kuma returned an invalid heartbeat response") from exc

    async def _get(self, url: str, slug: str, *, heartbeat: bool) -> bytes:
        try:
            requests = await self._target_policy.prepare(url, slug, heartbeat=heartbeat)
        except KumaTargetError as exc:
            raise KumaError("Kuma target is invalid or not allowed") from exc

        last_connection_error: Exception | None = None
        for request in requests:
            try:
                return await self._request(request)
            except (httpx.ConnectError, httpx.ConnectTimeout) as exc:
                last_connection_error = exc
            except httpx.TimeoutException as exc:
                raise KumaError("Kuma connection timed out") from exc
            except httpx.NetworkError as exc:
                raise KumaError("Kuma connection failed") from exc
        raise KumaError("Kuma connection failed") from last_connection_error

    async def _request(self, request: PreparedKumaRequest) -> bytes:
        extensions: dict[str, str] = {}
        if request.sni_hostname is not None:
            extensions["sni_hostname"] = request.sni_hostname
        async with self._http.stream(
            "GET",
            request.url,
            headers={"Host": request.host_header, "Accept": "application/json"},
            extensions=extensions,
            follow_redirects=False,
        ) as response:
            if response.status_code != httpx.codes.OK:
                raise KumaError(
                    f"Kuma returned HTTP {response.status_code}",
                    status_code=response.status_code,
                )
            content_length = response.headers.get("Content-Length")
            if content_length is not None:
                try:
                    declared_size = int(content_length)
                except ValueError as exc:
                    raise KumaError("Kuma returned an invalid response") from exc
                if declared_size > self._max_response_bytes:
                    raise KumaError("Kuma response is too large")

            body = bytearray()
            async for chunk in response.aiter_bytes():
                if len(body) + len(chunk) > self._max_response_bytes:
                    raise KumaError("Kuma response is too large")
                body.extend(chunk)
            return bytes(body)
