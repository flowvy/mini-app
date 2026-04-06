"""HTTP client for Uptime Kuma public status page API."""

from __future__ import annotations

import httpx


class KumaError(Exception):
    """Raised when Kuma API returns an error."""

    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail
        super().__init__(f"Kuma API error {status_code}: {detail}")


class UptimeKumaClient:
    """Stateless client — receives URL/slug per call, not on init."""

    def __init__(self, http: httpx.AsyncClient) -> None:
        self._http = http

    async def get_status_page(self, url: str, slug: str) -> dict:
        """Fetch status page config, groups, incidents.

        GET {url}/api/status-page/{slug}
        """
        endpoint = f"{url.rstrip('/')}/api/status-page/{slug}"
        resp = await self._http.get(endpoint)
        if resp.status_code != 200:
            raise KumaError(resp.status_code, resp.text)
        return resp.json()

    async def get_heartbeats(self, url: str, slug: str) -> dict:
        """Fetch heartbeat history and uptime percentages.

        GET {url}/api/status-page/heartbeat/{slug}
        """
        endpoint = f"{url.rstrip('/')}/api/status-page/heartbeat/{slug}"
        resp = await self._http.get(endpoint)
        if resp.status_code != 200:
            raise KumaError(resp.status_code, resp.text)
        return resp.json()
