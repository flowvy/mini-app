"""Admin users service — BFF layer for user management."""

from __future__ import annotations

import asyncio
import json
import logging

from redis.asyncio import Redis

from flowvy.repositories.user import UserRepository
from flowvy.schemas.admin_users import (
    AdminUserInternalSquadResponse,
    AdminUserResponse,
    AdminUsersResponse,
    AdminUserTrafficResponse,
)
from flowvy.schemas.remnawave import RemnawaveUserData
from flowvy.services.remnawave import RemnawaveClient

logger = logging.getLogger(__name__)

SQUADS_CACHE_KEY = "external_squads"
SQUADS_CACHE_TTL = 300


class AdminUsersService:
    """Aggregates Remnawave user data for the admin panel."""

    def __init__(
        self,
        remnawave: RemnawaveClient,
        redis: Redis,
        users: UserRepository,
    ) -> None:
        self._remnawave = remnawave
        self._redis = redis
        self._users = users

    async def get_all_users(self) -> AdminUsersResponse:
        """Fetch all users by batching Remnawave API calls."""
        batch_size = 100
        first = await self._remnawave.get_users(batch_size, 0)
        total = first.total
        all_users = list(first.users)
        if total > batch_size:
            remaining = range(batch_size, total, batch_size)
            logger.info("Fetching all users: %d total, %d batches", total, len(remaining) + 1)
            batches = await asyncio.gather(
                *(self._remnawave.get_users(batch_size, s) for s in remaining),
            )
            for batch in batches:
                all_users.extend(batch.users)
        squad_map = await self._get_external_squads_map()
        users = [_map_user_data(user, squad_map) for user in all_users]
        return AdminUsersResponse(users=users, total=total)

    async def get_users(
        self,
        size: int = 25,
        start: int = 0,
    ) -> AdminUsersResponse:
        """Fetch paginated user list from Remnawave."""
        page = await self._remnawave.get_users(size, start)
        squad_map = await self._get_external_squads_map()
        users = [_map_user_data(user, squad_map) for user in page.users]
        return AdminUsersResponse(users=users, total=page.total)

    async def get_user(self, user_id: int) -> AdminUserResponse:
        """Fetch single user from Remnawave + resolve squad."""
        user = await self._remnawave.get_user_by_id(user_id)
        squad_map = await self._get_external_squads_map()
        response = _map_user_data(user, squad_map)
        if user.telegram_id is not None:
            response.invited_count = await self._users.count_invited_by(user.telegram_id)
        return response

    async def search_user(self, query: str) -> AdminUsersResponse:
        """Search user by query — auto-detects type."""
        query = query.strip()
        if query.isdigit():
            result = await self._remnawave.get_user_by_telegram_id(int(query))
        elif "@" in query:
            result = await self._remnawave.search_user_by_email(query)
        else:
            result = await self._remnawave.search_user_by_username(query)

        if not result:
            return AdminUsersResponse(users=[], total=0)
        squad_map = await self._get_external_squads_map()
        users = [_map_user_data(result, squad_map)]
        return AdminUsersResponse(users=users, total=1)

    async def enable_user(self, user_id: int) -> None:
        """Enable a user in Remnawave."""
        await self._remnawave.enable_user(user_id)

    async def disable_user(self, user_id: int) -> None:
        """Disable a user in Remnawave."""
        await self._remnawave.disable_user(user_id)

    async def reset_user_traffic(self, user_id: int) -> None:
        """Reset traffic counters for a user."""
        await self._remnawave.reset_user_traffic(user_id)

    async def revoke_user_subscription(self, user_id: int) -> None:
        """Revoke subscription link for a user."""
        await self._remnawave.revoke_user_subscription(user_id)

    async def delete_user(self, user_id: int) -> None:
        """Permanently delete a user from Remnawave."""
        await self._remnawave.delete_user(user_id)

    async def _get_external_squads_map(self) -> dict[str, str]:
        """Return uuid→name map, cached in Redis for 5 minutes."""
        cached = await self._redis.get(SQUADS_CACHE_KEY)
        if cached:
            return json.loads(cached)
        squads = await self._remnawave.get_external_squads()
        squad_map = {s["uuid"]: s["name"] for s in squads}
        await self._redis.set(
            SQUADS_CACHE_KEY,
            json.dumps(squad_map),
            ex=SQUADS_CACHE_TTL,
        )
        return squad_map


def _map_user_data(
    user: RemnawaveUserData,
    squad_map: dict[str, str],
) -> AdminUserResponse:
    """Map typed RemnawaveUserData to admin user response."""
    ext_uuid = user.external_squad_uuid
    return AdminUserResponse(
        id=user.provider_id,
        username=user.username,
        status=user.status,
        tag=user.tag,
        description=user.description,
        traffic_limit_bytes=user.traffic_limit_bytes,
        traffic_limit_strategy=user.traffic_limit_strategy,
        expire_at=user.expire_at,
        telegram_id=user.telegram_id,
        email=user.email,
        hwid_device_limit=user.hwid_device_limit,
        created_at=user.created_at,
        subscription_url=user.subscription_url,
        active_internal_squads=[
            AdminUserInternalSquadResponse(name=s.name) for s in user.active_internal_squads
        ],
        external_squad_name=squad_map.get(ext_uuid) if ext_uuid else None,
        user_traffic=AdminUserTrafficResponse(
            used_traffic_bytes=user.user_traffic.used_traffic_bytes,
            lifetime_used_traffic_bytes=user.user_traffic.lifetime_used_traffic_bytes,
            online_at=user.user_traffic.online_at,
            first_connected_at=user.user_traffic.first_connected_at,
        ),
    )
