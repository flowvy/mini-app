"""HTTP client for Remnawave panel API."""

from __future__ import annotations

import httpx

from flowvy.schemas.remnawave import (
    RemnawaveDevice,
    RemnawaveSubInfo,
    RemnawaveSubInfoUser,
    RemnawaveUserData,
)


class RemnawaveError(Exception):
    """Non-2xx response from Remnawave."""

    def __init__(self, status: int, detail: str) -> None:
        self.status = status
        self.detail = detail
        super().__init__(f"Remnawave {status}: {detail}")


class RemnawaveClient:
    """Typed async wrapper around Remnawave REST API."""

    def __init__(self, base_url: str, token: str, http: httpx.AsyncClient) -> None:
        self._base = base_url.rstrip("/")
        self._token = token
        self._http = http

    def _headers(self) -> dict[str, str]:
        """Build authorization headers."""
        return {"Authorization": f"Bearer {self._token}"}

    async def _get(self, path: str) -> dict:
        """Send GET request, unwrap ``response`` envelope."""
        resp = await self._http.get(
            f"{self._base}{path}",
            headers=self._headers(),
        )
        if resp.status_code >= 400:
            raise RemnawaveError(resp.status_code, resp.text)
        body = resp.json()
        return body.get("response", body)

    async def _post(self, path: str, body: dict | None = None) -> dict:
        """Send POST request, unwrap ``response`` envelope."""
        resp = await self._http.post(
            f"{self._base}{path}",
            headers=self._headers(),
            json=body or {},
        )
        if resp.status_code >= 400:
            raise RemnawaveError(resp.status_code, resp.text)
        data = resp.json()
        return data.get("response", data)

    async def _delete(self, path: str) -> None:
        """Send DELETE request."""
        resp = await self._http.delete(
            f"{self._base}{path}",
            headers=self._headers(),
        )
        if resp.status_code >= 400:
            raise RemnawaveError(resp.status_code, resp.text)

    async def ping(self) -> bool:
        """Check Remnawave is reachable (``GET /api/auth/status``)."""
        resp = await self._http.get(
            f"{self._base}/api/auth/status",
            headers=self._headers(),
        )
        return resp.status_code == 200

    async def get_user_by_telegram_id(
        self,
        telegram_id: int,
    ) -> RemnawaveUserData | None:
        """Fetch user by Telegram ID. Returns None if not found."""
        data = await self._get(f"/api/users/by-telegram-id/{telegram_id}")
        if not isinstance(data, list) or len(data) == 0:
            return None
        raw = data[0]
        return RemnawaveUserData.from_raw(raw)

    async def get_devices(self, user_uuid: str) -> list[RemnawaveDevice]:
        """Fetch all HWID devices for a Remnawave user."""
        data = await self._get(f"/api/hwid/devices/{user_uuid}")
        raw_devices = data.get("devices", [])
        return [RemnawaveDevice.from_raw(d) for d in raw_devices]

    async def delete_device(self, user_uuid: str, hwid: str) -> None:
        """Delete a single HWID device."""
        await self._post(
            "/api/hwid/devices/delete",
            {"userUuid": user_uuid, "hwid": hwid},
        )

    async def delete_all_devices(self, user_uuid: str) -> None:
        """Delete all HWID devices for a user."""
        await self._post(
            "/api/hwid/devices/delete-all",
            {"userUuid": user_uuid},
        )

    async def get_metadata(self) -> dict:
        """Fetch system metadata (version, build, git info)."""
        return await self._get("/api/system/metadata")

    async def get_users(self, size: int = 25, start: int = 0) -> dict:
        """Fetch paginated user list (``GET /api/users``)."""
        return await self._get(f"/api/users?size={size}&start={start}")

    async def search_user_by_username(
        self,
        username: str,
    ) -> RemnawaveUserData | None:
        """Search user by exact username match. Returns single object."""
        data = await self._get(f"/api/users/by-username/{username}")
        if not isinstance(data, dict) or not data:
            return None
        return RemnawaveUserData.from_raw(data)

    async def search_user_by_email(
        self,
        email: str,
    ) -> RemnawaveUserData | None:
        """Search user by exact email match. Returns single object."""
        data = await self._get(f"/api/users/by-email/{email}")
        if not isinstance(data, dict) or not data:
            return None
        return RemnawaveUserData.from_raw(data)

    async def enable_user(self, uuid: str) -> dict:
        """Enable a user (``POST /api/users/{uuid}/actions/enable``)."""
        return await self._post(f"/api/users/{uuid}/actions/enable")

    async def disable_user(self, uuid: str) -> dict:
        """Disable a user (``POST /api/users/{uuid}/actions/disable``)."""
        return await self._post(f"/api/users/{uuid}/actions/disable")

    async def reset_user_traffic(self, uuid: str) -> dict:
        """Reset traffic counters (``POST /api/users/{uuid}/actions/reset-traffic``)."""
        return await self._post(f"/api/users/{uuid}/actions/reset-traffic")

    async def revoke_user_subscription(self, uuid: str) -> dict:
        """Revoke subscription link (``POST /api/users/{uuid}/actions/revoke``)."""
        return await self._post(f"/api/users/{uuid}/actions/revoke")

    async def delete_user(self, uuid: str) -> None:
        """Delete user permanently (``DELETE /api/users/{uuid}``)."""
        await self._delete(f"/api/users/{uuid}")

    async def get_system_stats(self) -> dict:
        """Fetch system stats (``GET /api/system/stats``). Raw dict."""
        return await self._get("/api/system/stats")

    async def get_bandwidth_stats(self) -> dict:
        """Fetch bandwidth stats (``GET /api/system/stats/bandwidth``). Raw dict."""
        return await self._get("/api/system/stats/bandwidth")

    async def get_external_squads(self) -> list[dict]:
        """Fetch all external squads (``GET /api/external-squads``)."""
        data = await self._get("/api/external-squads")
        return data.get("externalSquads", [])

    async def get_subscription_info(
        self,
        short_uuid: str,
    ) -> RemnawaveSubInfo:
        """Fetch public subscription info by short UUID."""
        data = await self._get(f"/api/sub/{short_uuid}/info")
        user_raw = data.get("user", {})
        return RemnawaveSubInfo(
            is_found=data.get("isFound", False),
            user=RemnawaveSubInfoUser(
                short_uuid=user_raw.get("shortUuid", ""),
                days_left=user_raw.get("daysLeft", 0),
                username=user_raw.get("username", ""),
                traffic_used_bytes=user_raw.get("trafficUsedBytes", "0"),
                traffic_limit_bytes=user_raw.get("trafficLimitBytes", "0"),
                lifetime_traffic_used_bytes=user_raw.get("lifetimeTrafficUsedBytes", "0"),
                expires_at=user_raw.get("expiresAt"),
                is_active=user_raw.get("isActive", False),
                user_status=user_raw.get("userStatus", "EXPIRED"),
                traffic_limit_strategy=user_raw.get("trafficLimitStrategy", "NO_RESET"),
                hwid_device_limit=user_raw.get("hwidDeviceLimit"),
                hwid_device_count=user_raw.get("hwidDeviceCount"),
            ),
            subscription_url=data.get("subscriptionUrl", ""),
        )
