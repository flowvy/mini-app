"""HTTP client for Remnawave panel API."""

from __future__ import annotations

import asyncio
import re
import uuid
from typing import Literal
from urllib.parse import quote, urlencode

import httpx
from pydantic import ValidationError

from flowvy.schemas.dashboard import RemnawaveBandwidth, RemnawaveStats
from flowvy.schemas.remnawave import (
    RemnawaveCreateUserRequest,
    RemnawaveDevice,
    RemnawaveSubInfo,
    RemnawaveSubInfoUser,
    RemnawaveUpdateUserRequest,
    RemnawaveUserData,
    RemnawaveUsersPage,
)


class RemnawaveError(Exception):
    """A safe Remnawave transport or contract failure."""

    def __init__(self, status: int, detail: str, *, retryable: bool = False) -> None:
        self.status = status
        self.detail = detail
        self.retryable = retryable
        super().__init__(f"Remnawave {status}: {detail}")


class RemnawaveClient:
    """Typed async wrapper around Remnawave REST API."""

    def __init__(self, base_url: str, token: str, http: httpx.AsyncClient) -> None:
        self._base = base_url.rstrip("/")
        self._token = token
        self._http = http
        self._api_major_value: int | None = None
        self._version_lock = asyncio.Lock()

    def _headers(self) -> dict[str, str]:
        """Build authorization headers."""
        return {"Authorization": f"Bearer {self._token}"}

    @staticmethod
    def _path_segment(value: object) -> str:
        """Percent-encode provider path parameters as exactly one segment."""
        return quote(str(value), safe="")

    @staticmethod
    def _unwrap_response(resp: httpx.Response) -> object:
        """Decode one JSON object without exposing the provider response body."""
        if not 200 <= resp.status_code < 300:
            raise RemnawaveError(
                resp.status_code,
                f"Provider returned HTTP {resp.status_code}",
                retryable=resp.status_code in {502, 503, 504},
            )
        try:
            body = resp.json()
        except (ValueError, TypeError) as exc:
            raise RemnawaveError(502, "Provider returned invalid JSON") from exc
        if not isinstance(body, dict):
            raise RemnawaveError(502, "Provider returned an invalid response envelope")
        if "response" not in body:
            raise RemnawaveError(502, "Provider returned an invalid response envelope")
        return body["response"]

    async def _get(self, path: str) -> object:
        """Send GET request, unwrap ``response`` envelope."""
        try:
            resp = await self._http.get(
                f"{self._base}{path}",
                headers=self._headers(),
            )
        except httpx.TimeoutException as exc:
            raise RemnawaveError(504, "Provider request timed out", retryable=True) from exc
        except httpx.RequestError as exc:
            raise RemnawaveError(502, "Provider connection failed", retryable=True) from exc
        return self._unwrap_response(resp)

    async def _post(self, path: str, body: dict | None = None) -> dict:
        """Send POST request, unwrap ``response`` envelope."""
        try:
            resp = await self._http.post(
                f"{self._base}{path}",
                headers=self._headers(),
                json=body or {},
            )
        except httpx.TimeoutException as exc:
            raise RemnawaveError(504, "Provider request timed out", retryable=True) from exc
        except httpx.RequestError as exc:
            raise RemnawaveError(502, "Provider connection failed", retryable=True) from exc
        data = self._unwrap_response(resp)
        if not isinstance(data, dict):
            raise RemnawaveError(502, "Provider returned an invalid action response")
        return data

    async def _patch(self, path: str, body: dict) -> dict:
        """Send PATCH request, unwrap one response object."""
        try:
            resp = await self._http.patch(
                f"{self._base}{path}",
                headers=self._headers(),
                json=body,
            )
        except httpx.TimeoutException as exc:
            raise RemnawaveError(504, "Provider request timed out", retryable=True) from exc
        except httpx.RequestError as exc:
            raise RemnawaveError(502, "Provider connection failed", retryable=True) from exc
        data = self._unwrap_response(resp)
        if not isinstance(data, dict):
            raise RemnawaveError(502, "Provider returned an invalid update response")
        return data

    async def _delete(self, path: str) -> None:
        """Send DELETE request."""
        try:
            resp = await self._http.delete(
                f"{self._base}{path}",
                headers=self._headers(),
            )
        except httpx.TimeoutException as exc:
            raise RemnawaveError(504, "Provider request timed out", retryable=True) from exc
        except httpx.RequestError as exc:
            raise RemnawaveError(502, "Provider connection failed", retryable=True) from exc
        if not 200 <= resp.status_code < 300:
            raise RemnawaveError(
                resp.status_code,
                f"Provider returned HTTP {resp.status_code}",
            )

    async def ping(self) -> bool:
        """Check Remnawave is reachable (``GET /api/auth/status``)."""
        try:
            resp = await self._http.get(
                f"{self._base}/api/auth/status",
                headers=self._headers(),
            )
        except httpx.RequestError:
            return False
        return resp.status_code == 200

    def _remember_api_version(self, metadata: dict) -> int:
        """Validate and cache the supported API major from system metadata."""
        version = metadata.get("version")
        if not isinstance(version, str):
            raise RemnawaveError(502, "Provider returned an invalid API version")
        match = re.fullmatch(r"v?(\d+)\.\d+\.\d+(?:[-+].+)?", version)
        if match is None:
            raise RemnawaveError(502, "Provider returned an invalid API version")
        major = int(match.group(1))
        if major not in {2, 3}:
            raise RemnawaveError(502, "Unsupported Remnawave API version")
        self._api_major_value = major
        return major

    async def _api_major(self) -> int:
        """Resolve the API generation once, serializing concurrent first use."""
        if self._api_major_value is not None:
            return self._api_major_value
        async with self._version_lock:
            if self._api_major_value is None:
                await self.get_metadata()
        if self._api_major_value is None:  # pragma: no cover - defensive invariant
            raise RemnawaveError(502, "Provider API version is unavailable")
        return self._api_major_value

    @staticmethod
    def _parse_users(data: object, detail: str) -> list[RemnawaveUserData]:
        """Validate a list of user objects with a stable safe error."""
        if not isinstance(data, list):
            raise RemnawaveError(502, detail)
        try:
            return [RemnawaveUserData.from_raw(raw) for raw in data]
        except (KeyError, TypeError, ValueError, ValidationError) as exc:
            raise RemnawaveError(502, detail) from exc

    @staticmethod
    def _parse_squad_options(data: object, key: str, detail: str) -> list[dict[str, str]]:
        """Allow-list UUID/name pairs from a squad collection response."""
        if not isinstance(data, dict) or not isinstance(data.get(key), list):
            raise RemnawaveError(502, detail)
        options: list[dict[str, str]] = []
        try:
            for raw in data[key]:
                if not isinstance(raw, dict):
                    raise ValueError
                squad_uuid = str(uuid.UUID(str(raw["uuid"])))
                name = raw["name"]
                if not isinstance(name, str) or not name.strip():
                    raise ValueError
                options.append({"uuid": squad_uuid, "name": name})
        except (KeyError, TypeError, ValueError) as exc:
            raise RemnawaveError(502, detail) from exc
        return options

    @staticmethod
    def _parse_user_tags(data: object) -> list[str]:
        """Validate and normalize the provider-owned user-tag catalogue."""
        if not isinstance(data, dict) or not isinstance(data.get("tags"), list):
            raise RemnawaveError(502, "Unexpected user-tags response")
        tags: list[str] = []
        for raw in data["tags"]:
            if not isinstance(raw, str):
                raise RemnawaveError(502, "Unexpected user-tags response")
            normalized = raw.strip().upper()
            if re.fullmatch(r"[A-Z0-9_]{1,16}", normalized) is None:
                raise RemnawaveError(502, "Unexpected user-tags response")
            if normalized not in tags:
                tags.append(normalized)
        return tags

    async def _get_filtered_users_v3(
        self,
        filter_name: str,
        filter_value: object,
    ) -> list[RemnawaveUserData]:
        """Read every cursor page for one exact Remnawave 3.x stream filter."""
        users: list[RemnawaveUserData] = []
        cursor: str | None = None
        seen_cursors: set[str] = set()
        for _page in range(100):
            query: dict[str, object] = {"size": 1000, filter_name: filter_value}
            if cursor is not None:
                query["cursor"] = cursor
            data = await self._get(f"/api/users/stream?{urlencode(query)}")
            if not isinstance(data, dict):
                raise RemnawaveError(502, "Unexpected user-stream response")
            users.extend(self._parse_users(data.get("users"), "Unexpected user-stream response"))
            has_more = data.get("hasMore")
            if not isinstance(has_more, bool):
                raise RemnawaveError(502, "Unexpected user-stream response")
            if not has_more:
                return users
            raw_cursor = data.get("nextCursor")
            if not isinstance(raw_cursor, (str, int)):
                raise RemnawaveError(502, "Unexpected user-stream response")
            cursor = str(raw_cursor)
            if not cursor.isdigit() or cursor in seen_cursors:
                raise RemnawaveError(502, "Unexpected user-stream response")
            seen_cursors.add(cursor)
        raise RemnawaveError(502, "User-stream pagination limit exceeded")

    async def get_user_by_telegram_id(
        self,
        telegram_id: int,
    ) -> RemnawaveUserData | None:
        """Fetch one exact user by Telegram ID, failing on ambiguity."""
        users = await self.get_users_by_telegram_id(telegram_id)
        if not users:
            return None
        if len(users) > 1:
            raise RemnawaveError(502, "Ambiguous Telegram user mapping")
        return users[0]

    async def create_user(
        self,
        request: RemnawaveCreateUserRequest,
    ) -> RemnawaveUserData:
        """Create one user using the contract shared by 2.8 and 3.0/3.1."""
        await self._api_major()
        data = await self._post("/api/users", request.to_provider_payload())
        try:
            user = RemnawaveUserData.from_raw(data)
        except (KeyError, TypeError, ValueError, ValidationError) as exc:
            raise RemnawaveError(502, "Unexpected create-user response") from exc
        if user.telegram_id != request.telegram_id or user.username != request.username:
            raise RemnawaveError(502, "Unexpected create-user response")
        return user

    async def update_user_access(
        self,
        user: RemnawaveUserData,
        request: RemnawaveUpdateUserRequest,
    ) -> RemnawaveUserData:
        """Apply one documented absolute user state for Remnawave 2.8/3.1."""
        if await self._api_major() >= 3:
            identity_field: Literal["id", "uuid"] = "id"
            identity: int | str = user.provider_id
        else:
            if user.uuid is None:
                raise RemnawaveError(502, "Legacy user UUID is unavailable")
            identity_field = "uuid"
            identity = user.uuid
        data = await self._patch(
            "/api/users",
            request.to_provider_payload(
                identity_field=identity_field,
                identity=identity,
            ),
        )
        try:
            updated = RemnawaveUserData.from_raw(data)
        except (KeyError, TypeError, ValueError, ValidationError) as exc:
            raise RemnawaveError(502, "Unexpected update-user response") from exc
        if updated.provider_id != user.provider_id or updated.telegram_id != user.telegram_id:
            raise RemnawaveError(502, "Unexpected update-user response")
        return updated

    async def get_users_by_telegram_id(
        self,
        telegram_id: int,
    ) -> list[RemnawaveUserData]:
        """Fetch and exact-filter every Remnawave user for a Telegram ID."""
        if await self._api_major() >= 3:
            users = await self._get_filtered_users_v3("telegramId", telegram_id)
        else:
            data = await self._get(f"/api/users/by-telegram-id/{telegram_id}")
            users = self._parse_users(data, "Unexpected Telegram user lookup response")
        return [user for user in users if user.telegram_id == telegram_id]

    async def _user_path_identifier(self, user: RemnawaveUserData) -> str:
        """Select the exact identity required by the detected API generation."""
        if await self._api_major() >= 3:
            return str(user.provider_id)
        if user.uuid is None:
            raise RemnawaveError(502, "Legacy user UUID is unavailable")
        return user.uuid

    async def _resolve_user_path_identifier(self, user_id: int) -> str:
        """Resolve a BFF numeric identity to the version-specific provider path."""
        if await self._api_major() >= 3:
            return str(user_id)
        user = await self.get_user_by_id(user_id)
        return await self._user_path_identifier(user)

    async def get_devices(self, user: RemnawaveUserData) -> list[RemnawaveDevice]:
        """Fetch all HWID devices for a Remnawave user."""
        identifier = await self._user_path_identifier(user)
        data = await self._get(f"/api/hwid/devices/{self._path_segment(identifier)}")
        if not isinstance(data, dict):
            raise RemnawaveError(502, "Unexpected device response")
        if "devices" not in data:
            raise RemnawaveError(502, "Unexpected device response")
        raw_devices = data["devices"]
        if not isinstance(raw_devices, list):
            raise RemnawaveError(502, "Unexpected device response")
        try:
            return [RemnawaveDevice.from_raw(d) for d in raw_devices]
        except (KeyError, TypeError, ValueError, ValidationError) as exc:
            raise RemnawaveError(502, "Unexpected device response") from exc

    async def delete_device(self, user: RemnawaveUserData, hwid: str) -> None:
        """Delete a single HWID device."""
        if await self._api_major() >= 3:
            body = {"userId": user.provider_id, "hwid": hwid}
        else:
            if user.uuid is None:
                raise RemnawaveError(502, "Legacy user UUID is unavailable")
            body = {"userUuid": user.uuid, "hwid": hwid}
        await self._post(
            "/api/hwid/devices/delete",
            body,
        )

    async def delete_all_devices(self, user: RemnawaveUserData) -> None:
        """Delete all HWID devices for a user."""
        if await self._api_major() >= 3:
            body = {"userId": user.provider_id}
        else:
            if user.uuid is None:
                raise RemnawaveError(502, "Legacy user UUID is unavailable")
            body = {"userUuid": user.uuid}
        await self._post(
            "/api/hwid/devices/delete-all",
            body,
        )

    async def get_metadata(self) -> dict:
        """Fetch system metadata (version, build, git info)."""
        data = await self._get("/api/system/metadata")
        if not isinstance(data, dict):
            raise RemnawaveError(502, "Unexpected metadata response")
        self._remember_api_version(data)
        return data

    async def get_users(self, size: int = 25, start: int = 0) -> RemnawaveUsersPage:
        """Fetch and validate one paginated user list."""
        data = await self._get(f"/api/users?size={size}&start={start}")
        if not isinstance(data, dict) or type(data.get("total")) is not int:
            raise RemnawaveError(502, "Unexpected user-list response")
        total = data["total"]
        users = self._parse_users(data.get("users"), "Unexpected user-list response")
        if total < len(users):
            raise RemnawaveError(502, "Unexpected user-list response")
        return RemnawaveUsersPage(users=users, total=total)

    async def get_user_by_id(self, user_id: int) -> RemnawaveUserData:
        """Fetch one user by the stable numeric ID across 2.x and 3.x."""
        if await self._api_major() >= 3:
            path = f"/api/users/{self._path_segment(user_id)}"
        else:
            path = f"/api/users/by-id/{self._path_segment(user_id)}"
        data = await self._get(path)
        if not isinstance(data, dict):
            raise RemnawaveError(502, "Unexpected user response")
        try:
            user = RemnawaveUserData.from_raw(data)
        except (KeyError, TypeError, ValueError, ValidationError) as exc:
            raise RemnawaveError(502, "Unexpected user response") from exc
        if user.provider_id != user_id:
            raise RemnawaveError(502, "Unexpected user response")
        return user

    async def search_user_by_username(
        self,
        username: str,
    ) -> RemnawaveUserData | None:
        """Search user by exact username match. Returns single object."""
        data = await self._get(f"/api/users/by-username/{self._path_segment(username)}")
        if not isinstance(data, dict) or not data:
            return None
        try:
            user = RemnawaveUserData.from_raw(data)
        except (KeyError, TypeError, ValueError, ValidationError) as exc:
            raise RemnawaveError(502, "Unexpected username lookup response") from exc
        if user.username != username:
            raise RemnawaveError(502, "Unexpected username lookup response")
        return user

    async def search_user_by_email(
        self,
        email: str,
    ) -> RemnawaveUserData | None:
        """Search one exact email, failing closed on non-unique matches."""
        if await self._api_major() >= 3:
            users = await self._get_filtered_users_v3("email", email)
        else:
            data = await self._get(f"/api/users/by-email/{self._path_segment(email)}")
            users = self._parse_users(data, "Unexpected email lookup response")
        matches = [
            user
            for user in users
            if user.email is not None and user.email.casefold() == email.casefold()
        ]
        if not matches:
            return None
        if len(matches) > 1:
            raise RemnawaveError(502, "Ambiguous email user mapping")
        return matches[0]

    async def enable_user(self, user_id: int) -> dict:
        """Enable a user through its version-specific provider path."""
        identifier = await self._resolve_user_path_identifier(user_id)
        return await self._post(f"/api/users/{self._path_segment(identifier)}/actions/enable")

    async def disable_user(self, user_id: int) -> dict:
        """Disable a user through its version-specific provider path."""
        identifier = await self._resolve_user_path_identifier(user_id)
        return await self._post(f"/api/users/{self._path_segment(identifier)}/actions/disable")

    async def reset_user_traffic(self, user_id: int) -> dict:
        """Reset traffic counters through the version-specific provider path."""
        identifier = await self._resolve_user_path_identifier(user_id)
        return await self._post(
            f"/api/users/{self._path_segment(identifier)}/actions/reset-traffic"
        )

    async def revoke_user_subscription(self, user_id: int) -> dict:
        """Revoke a subscription through the version-specific provider path."""
        identifier = await self._resolve_user_path_identifier(user_id)
        return await self._post(f"/api/users/{self._path_segment(identifier)}/actions/revoke")

    async def delete_user(self, user_id: int) -> None:
        """Delete a user through the version-specific provider path."""
        identifier = await self._resolve_user_path_identifier(user_id)
        await self._delete(f"/api/users/{self._path_segment(identifier)}")

    async def get_system_stats(self) -> dict:
        """Fetch and allow-list system stats used by the dashboard."""
        data = await self._get("/api/system/stats")
        try:
            return RemnawaveStats.model_validate(data).model_dump(by_alias=True)
        except ValidationError as exc:
            raise RemnawaveError(502, "Unexpected system-stats response") from exc

    async def get_bandwidth_stats(self) -> dict:
        """Fetch and allow-list bandwidth stats used by the dashboard."""
        data = await self._get("/api/system/stats/bandwidth")
        try:
            return RemnawaveBandwidth.model_validate(data).model_dump(by_alias=True)
        except ValidationError as exc:
            raise RemnawaveError(502, "Unexpected bandwidth response") from exc

    async def get_external_squads(self) -> list[dict]:
        """Fetch all external squads (``GET /api/external-squads``)."""
        data = await self._get("/api/external-squads")
        return self._parse_squad_options(
            data,
            "externalSquads",
            "Unexpected external-squads response",
        )

    async def get_internal_squads(self) -> list[dict[str, str]]:
        """Fetch allow-listed internal squad choices."""
        data = await self._get("/api/internal-squads")
        return self._parse_squad_options(
            data,
            "internalSquads",
            "Unexpected internal-squads response",
        )

    async def get_user_tags(self) -> list[str]:
        """Fetch allow-listed user tags (``GET /api/users/tags``)."""
        data = await self._get("/api/users/tags")
        return self._parse_user_tags(data)

    async def get_subscription_info(
        self,
        short_uuid: str,
    ) -> RemnawaveSubInfo:
        """Fetch public subscription info by short UUID."""
        data = await self._get(f"/api/sub/{self._path_segment(short_uuid)}/info")
        if not isinstance(data, dict):
            raise RemnawaveError(502, "Unexpected subscription-info response")
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
