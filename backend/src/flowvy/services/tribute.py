"""Bounded read-only client for the fixed Tribute API origin."""

from __future__ import annotations

from collections.abc import Mapping

import httpx
from pydantic import ValidationError

from flowvy.schemas.tribute import (
    TributeCatalog,
    TributeSubscriptionsResponse,
)

TRIBUTE_SUBSCRIPTIONS_URL = "https://tribute.tg/api/v1/subscriptions"


class TributeError(Exception):
    """A safe Tribute integration failure without upstream body or credentials."""

    def __init__(self, detail: str, *, status_code: int | None = None) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(detail)


class TributeClient:
    """Read subscriptions from Tribute's documented fixed-origin endpoint."""

    def __init__(
        self,
        http: httpx.AsyncClient,
        *,
        api_key: str,
        max_response_bytes: int,
    ) -> None:
        self._http = http
        self._api_key = api_key.strip()
        self._max_response_bytes = max_response_bytes

    @property
    def credentials_configured(self) -> bool:
        """Expose only whether the server has a Tribute API key."""
        return bool(self._api_key)

    async def test_connection(self) -> None:
        """Run one fixed-origin, read-only request without creating a payment."""
        if not self.credentials_configured:
            raise TributeError("Tribute API key is not configured")

        body = await self._request(TRIBUTE_SUBSCRIPTIONS_URL)
        try:
            TributeSubscriptionsResponse.model_validate_json(body)
        except (ValidationError, ValueError) as exc:
            raise TributeError("Tribute returned an invalid subscriptions response") from exc

    async def get_catalog(self) -> TributeCatalog:
        """Fetch subscriptions through the documented read-only endpoint."""
        if not self.credentials_configured:
            raise TributeError("Tribute API key is not configured")

        subscriptions_body = await self._request(TRIBUTE_SUBSCRIPTIONS_URL)
        try:
            subscriptions = TributeSubscriptionsResponse.model_validate_json(subscriptions_body)
        except (ValidationError, ValueError) as exc:
            raise TributeError("Tribute returned an invalid subscriptions response") from exc

        return TributeCatalog(subscriptions=subscriptions.result)

    async def _request(
        self,
        url: str,
        *,
        params: Mapping[str, str | int | bool] | None = None,
    ) -> bytes:
        try:
            async with self._http.stream(
                "GET",
                url,
                params=params,
                headers={"Api-Key": self._api_key, "Accept": "application/json"},
                follow_redirects=False,
            ) as response:
                if response.status_code != httpx.codes.OK:
                    raise TributeError(
                        f"Tribute returned HTTP {response.status_code}",
                        status_code=response.status_code,
                    )

                content_length = response.headers.get("Content-Length")
                if content_length is not None:
                    try:
                        declared_size = int(content_length)
                    except ValueError as exc:
                        raise TributeError("Tribute returned an invalid response") from exc
                    if declared_size > self._max_response_bytes:
                        raise TributeError("Tribute response is too large")

                body = bytearray()
                async for chunk in response.aiter_bytes():
                    if len(body) + len(chunk) > self._max_response_bytes:
                        raise TributeError("Tribute response is too large")
                    body.extend(chunk)
                return bytes(body)
        except TributeError:
            raise
        except httpx.TimeoutException as exc:
            raise TributeError("Tribute connection timed out") from exc
        except httpx.TransportError as exc:
            raise TributeError("Tribute connection failed") from exc
