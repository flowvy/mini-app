"""Devices aggregation service (BFF layer)."""

from __future__ import annotations

from flowvy.repositories.subscription import SubscriptionRepository
from flowvy.repositories.user import UserRepository
from flowvy.schemas.devices import DeviceResponse, DevicesResponse
from flowvy.schemas.remnawave import RemnawaveDevice
from flowvy.services.remnawave import RemnawaveClient


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

        Reads remnawave_uuid and device_limit from local DB.
        Falls back to Remnawave lookup if subscription not found.
        Returns None if the user has no Remnawave account.
        """
        subscriptions = await self._sub_repo.get_active_by_user_id(telegram_id)
        if subscriptions and subscriptions[0].remnawave_uuid:
            sub = subscriptions[0]
            devices = await self._remnawave.get_devices(str(sub.remnawave_uuid))
            return self._to_response(devices, sub.device_limit)

        return await self._fallback(telegram_id)

    async def delete_device(self, telegram_id: int, hwid: str) -> None:
        """Delete a single device by HWID."""
        user_uuid = await self._resolve_uuid(telegram_id)
        if user_uuid is None:
            return
        await self._remnawave.delete_device(user_uuid, hwid)

    async def delete_all(self, telegram_id: int) -> None:
        """Delete all devices for the user."""
        user_uuid = await self._resolve_uuid(telegram_id)
        if user_uuid is None:
            return
        await self._remnawave.delete_all_devices(user_uuid)

    async def _resolve_uuid(self, telegram_id: int) -> str | None:
        """Get Remnawave UUID from DB or fallback to API."""
        subscriptions = await self._sub_repo.get_active_by_user_id(telegram_id)
        if subscriptions and subscriptions[0].remnawave_uuid:
            return str(subscriptions[0].remnawave_uuid)

        user = await self._remnawave.get_user_by_telegram_id(telegram_id)
        if user is None:
            return None
        await self._user_repo.ensure_exists(telegram_id, user.username)
        await self._sub_repo.upsert_from_remnawave(
            user_id=telegram_id,
            remnawave_uuid=user.uuid,
            status=user.status,
            device_limit=user.hwid_device_limit,
            expires_at=user.expire_at,
        )
        return user.uuid

    async def _fallback(self, telegram_id: int) -> DevicesResponse | None:
        """Fetch user from Remnawave, save to DB, then get devices."""
        user = await self._remnawave.get_user_by_telegram_id(telegram_id)
        if user is None:
            return None
        await self._user_repo.ensure_exists(telegram_id, user.username)
        await self._sub_repo.upsert_from_remnawave(
            user_id=telegram_id,
            remnawave_uuid=user.uuid,
            status=user.status,
            device_limit=user.hwid_device_limit,
            expires_at=user.expire_at,
        )
        devices = await self._remnawave.get_devices(user.uuid)
        return self._to_response(devices, user.hwid_device_limit)

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
                    created_at=int(d.created_at.timestamp()),
                )
                for d in devices
            ],
            total=len(devices),
            limit=limit,
        )
