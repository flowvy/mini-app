"""HTTP client for Remnawave panel API."""

from __future__ import annotations

import httpx

from flowvy.schemas.remnawave import (
    RemnawaveDevice,
    RemnawaveSubInfo,
    RemnawaveSubInfoUser,
    RemnawaveUserData,
    RemnawaveUserTraffic,
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
        return _parse_user_data(raw)

    async def get_devices(self, user_uuid: str) -> list[RemnawaveDevice]:
        """Fetch all HWID devices for a Remnawave user."""
        data = await self._get(f"/api/hwid/devices/{user_uuid}")
        raw_devices = data.get("devices", [])
        return [_parse_device(d) for d in raw_devices]

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


def _parse_device(raw: dict) -> RemnawaveDevice:
    """Map camelCase JSON to RemnawaveDevice model."""
    return RemnawaveDevice(
        hwid=raw["hwid"],
        user_uuid=raw["userUuid"],
        platform=raw.get("platform"),
        os_version=raw.get("osVersion"),
        device_model=raw.get("deviceModel"),
        user_agent=raw.get("userAgent"),
        created_at=raw["createdAt"],
        updated_at=raw["updatedAt"],
    )


def _parse_user_data(raw: dict) -> RemnawaveUserData:
    """Map camelCase JSON to RemnawaveUserData model."""
    traffic = raw.get("userTraffic", {})
    return RemnawaveUserData(
        uuid=raw["uuid"],
        short_uuid=raw["shortUuid"],
        username=raw["username"],
        status=raw.get("status", "ACTIVE"),
        traffic_limit_bytes=raw.get("trafficLimitBytes", 0),
        traffic_limit_strategy=raw.get("trafficLimitStrategy", "NO_RESET"),
        expire_at=raw["expireAt"],
        created_at=raw["createdAt"],
        updated_at=raw["updatedAt"],
        telegram_id=raw.get("telegramId"),
        email=raw.get("email"),
        hwid_device_limit=raw.get("hwidDeviceLimit"),
        last_traffic_reset_at=raw.get("lastTrafficResetAt"),
        subscription_url=raw["subscriptionUrl"],
        user_traffic=RemnawaveUserTraffic(
            used_traffic_bytes=traffic.get("usedTrafficBytes", 0),
            lifetime_used_traffic_bytes=traffic.get("lifetimeUsedTrafficBytes", 0),
            online_at=traffic.get("onlineAt"),
            first_connected_at=traffic.get("firstConnectedAt"),
        ),
    )
