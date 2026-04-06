"""Admin users service — BFF layer for user management."""

from __future__ import annotations

from flowvy.schemas.admin_users import (
    AdminUserResponse,
    AdminUsersResponse,
    AdminUserTrafficResponse,
)
from flowvy.schemas.remnawave import RemnawaveUserData
from flowvy.services.remnawave import RemnawaveClient


class AdminUsersService:
    """Aggregates Remnawave user data for the admin panel."""

    def __init__(self, remnawave: RemnawaveClient) -> None:
        self._remnawave = remnawave

    async def get_users(
        self,
        size: int = 25,
        start: int = 0,
    ) -> AdminUsersResponse:
        """Fetch paginated user list from Remnawave."""
        data = await self._remnawave.get_users(size, start)
        users = [_to_response(raw) for raw in data.get("users", [])]
        return AdminUsersResponse(users=users, total=data.get("total", 0))

    async def search_user(self, query: str) -> AdminUsersResponse:
        """Search user by query — auto-detects type.

        Pure digits → telegram_id, contains @ or . → email, else → username.
        """
        query = query.strip()
        if query.isdigit():
            result = await self._remnawave.get_user_by_telegram_id(int(query))
            users = [_map_user_data(result)] if result else []
        elif "@" in query or "." in query:
            result = await self._remnawave.search_user_by_email(query)
            users = [_map_user_data(result)] if result else []
        else:
            result = await self._remnawave.search_user_by_username(query)
            users = [_map_user_data(result)] if result else []
        return AdminUsersResponse(users=users, total=len(users))


def _to_response(raw: dict) -> AdminUserResponse:
    """Map raw Remnawave JSON dict to admin user response."""
    traffic = raw.get("userTraffic", {})
    return AdminUserResponse(
        uuid=raw["uuid"],
        username=raw["username"],
        status=raw.get("status", "ACTIVE"),
        tag=raw.get("tag"),
        traffic_limit_bytes=raw.get("trafficLimitBytes", 0),
        traffic_limit_strategy=raw.get("trafficLimitStrategy", "NO_RESET"),
        expire_at=raw["expireAt"],
        telegram_id=raw.get("telegramId"),
        email=raw.get("email"),
        hwid_device_limit=raw.get("hwidDeviceLimit"),
        created_at=raw["createdAt"],
        subscription_url=raw.get("subscriptionUrl", ""),
        user_traffic=AdminUserTrafficResponse(
            used_traffic_bytes=traffic.get("usedTrafficBytes", 0),
            lifetime_used_traffic_bytes=traffic.get("lifetimeUsedTrafficBytes", 0),
            online_at=traffic.get("onlineAt"),
        ),
    )


def _map_user_data(user: RemnawaveUserData) -> AdminUserResponse:
    """Map typed RemnawaveUserData to admin user response."""
    return AdminUserResponse(
        uuid=user.uuid,
        username=user.username,
        status=user.status,
        tag=user.tag,
        traffic_limit_bytes=user.traffic_limit_bytes,
        traffic_limit_strategy=user.traffic_limit_strategy,
        expire_at=user.expire_at,
        telegram_id=user.telegram_id,
        email=user.email,
        hwid_device_limit=user.hwid_device_limit,
        created_at=user.created_at,
        subscription_url=user.subscription_url,
        user_traffic=AdminUserTrafficResponse(
            used_traffic_bytes=user.user_traffic.used_traffic_bytes,
            lifetime_used_traffic_bytes=user.user_traffic.lifetime_used_traffic_bytes,
            online_at=user.user_traffic.online_at,
        ),
    )
