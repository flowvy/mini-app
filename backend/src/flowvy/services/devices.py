"""Devices aggregation service (BFF layer)."""

from __future__ import annotations

from flowvy.repositories.subscription import SubscriptionRepository
from flowvy.repositories.user import UserRepository
from flowvy.schemas.devices import DeviceResponse, DevicesResponse
from flowvy.schemas.remnawave import RemnawaveDevice, RemnawaveUserData
from flowvy.services.remnawave import RemnawaveClient


class DeviceOwnershipError(Exception):
    """Raised when current Remnawave ownership cannot be proven safely."""


class DevicesService:
    """Reads device list from Remnawave, limit from local DB."""

    def __init__(
        self,
        remnawave: RemnawaveClient,
        sub_repo: SubscriptionRepository,
        user_repo: UserRepository,
    ) -> None:
        self._remnawave = remnawave
        self._sub_repo = sub_repo
        self._user_repo = user_repo

    async def get_for_user(
        self,
        telegram_id: int,
    ) -> DevicesResponse | None:
        """Fetch devices for a Telegram user.

        Confirms ownership in Remnawave on every request. The local DB is only
        used to disambiguate multiple fresh exact matches and as a cache.
        Returns None if the user has no Remnawave account.
        """
        user = await self._resolve_fresh_owner(telegram_id)
        if user is None:
            return None
        await self._cache_owner(telegram_id, user)
        devices = await self._remnawave.get_devices(user)
        if any(not self._belongs_to(device, user) for device in devices):
            raise DeviceOwnershipError("Remnawave returned devices for another user")
        return self._to_response(devices, user.hwid_device_limit)

    @staticmethod
    def _belongs_to(device: RemnawaveDevice, user: RemnawaveUserData) -> bool:
        """Match the owner keys used by Remnawave 2.7 and 2.8 contracts."""
        if device.user_uuid is not None:
            return user.uuid is not None and device.user_uuid == user.uuid
        return device.user_id is not None and device.user_id == user.provider_id

    async def delete_device(self, telegram_id: int, hwid: str) -> None:
        """Delete a single device by HWID."""
        user = await self._resolve_fresh_owner(telegram_id)
        if user is None:
            raise DeviceOwnershipError("Current device owner was not found")
        await self._cache_owner(telegram_id, user)
        await self._remnawave.delete_device(user, hwid)

    async def delete_all(self, telegram_id: int) -> None:
        """Delete all devices for the user."""
        user = await self._resolve_fresh_owner(telegram_id)
        if user is None:
            raise DeviceOwnershipError("Current device owner was not found")
        await self._cache_owner(telegram_id, user)
        await self._remnawave.delete_all_devices(user)

    async def _resolve_fresh_owner(
        self,
        telegram_id: int,
    ) -> RemnawaveUserData | None:
        """Resolve ownership from a fresh, exact provider lookup."""
        users = await self._remnawave.get_users_by_telegram_id(telegram_id)
        if not users:
            return None
        if len(users) == 1:
            return users[0]

        subscriptions = await self._sub_repo.get_active_by_user_id(telegram_id)
        local_ids = {
            subscription.remnawave_user_id
            for subscription in subscriptions
            if subscription.remnawave_user_id is not None
        }
        local_uuids = {
            str(subscription.remnawave_uuid)
            for subscription in subscriptions
            if subscription.remnawave_uuid
        }
        matches = [
            user
            for user in users
            if user.provider_id in local_ids
            or (user.uuid is not None and user.uuid in local_uuids)
        ]
        if len(matches) == 1:
            return matches[0]
        raise DeviceOwnershipError("Remnawave user ownership is ambiguous")

    async def _cache_owner(
        self,
        telegram_id: int,
        user: RemnawaveUserData,
    ) -> None:
        """Refresh the local cache after provider ownership is confirmed."""
        await self._user_repo.ensure_exists(telegram_id, user.username)
        await self._sub_repo.upsert_from_remnawave(
            user_id=telegram_id,
            remnawave_user_id=user.provider_id,
            remnawave_uuid=user.uuid,
            status=user.status,
            device_limit=user.hwid_device_limit,
            expires_at=user.expire_at,
        )

    def _to_response(
        self,
        devices: list[RemnawaveDevice],
        limit: int | None,
    ) -> DevicesResponse:
        """Map Remnawave devices to BFF response."""
        return DevicesResponse(
            devices=[
                DeviceResponse(
                    hwid=d.hwid,
                    platform=d.platform,
                    os_version=d.os_version,
                    device_model=d.device_model,
                    user_agent=d.user_agent,
                    request_ip=d.request_ip,
                    created_at=int(d.created_at.timestamp()),
                    updated_at=int(d.updated_at.timestamp()),
                )
                for d in devices
            ],
            total=len(devices),
            limit=limit,
        )
