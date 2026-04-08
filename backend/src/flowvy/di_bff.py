"""Dishka providers for BFF (Backend-for-Frontend) services."""

from __future__ import annotations

import httpx
from dishka import Provider, Scope, provide
from redis.asyncio import Redis

from flowvy.repositories.provider_settings import ProviderSettingsRepository
from flowvy.repositories.subscription import SubscriptionRepository
from flowvy.repositories.user import UserRepository
from flowvy.services.admin_users import AdminUsersService
from flowvy.services.devices import DevicesService
from flowvy.services.kuma import UptimeKumaClient
from flowvy.services.provider_settings import ProviderSettingsService
from flowvy.services.pulse import PulseService
from flowvy.services.remnawave import RemnawaveClient
from flowvy.services.subscription import SubscriptionService


class BffServiceProvider(Provider):
    """Provides BFF services (REQUEST scope) and their APP-scope clients."""

    @provide(scope=Scope.APP)
    def get_kuma(self, http: httpx.AsyncClient) -> UptimeKumaClient:
        """Create Uptime Kuma API client."""
        return UptimeKumaClient(http)

    @provide(scope=Scope.REQUEST)
    def get_subscription_service(
        self,
        remnawave: RemnawaveClient,
        sub_repo: SubscriptionRepository,
        user_repo: UserRepository,
    ) -> SubscriptionService:
        """Create subscription service with DB upsert."""
        return SubscriptionService(remnawave, sub_repo, user_repo)

    @provide(scope=Scope.REQUEST)
    def get_devices_service(
        self,
        remnawave: RemnawaveClient,
        sub_repo: SubscriptionRepository,
        user_repo: UserRepository,
    ) -> DevicesService:
        """Create devices service with DB read + Remnawave fallback."""
        return DevicesService(remnawave, sub_repo, user_repo)

    @provide(scope=Scope.REQUEST)
    def get_pulse_service(
        self,
        kuma: UptimeKumaClient,
        ps_repo: ProviderSettingsRepository,
        redis: Redis,
    ) -> PulseService:
        """Create pulse service with Kuma + Redis cache."""
        return PulseService(kuma, ps_repo, redis)

    @provide(scope=Scope.REQUEST)
    def get_provider_settings_service(
        self,
        repo: ProviderSettingsRepository,
        remnawave: RemnawaveClient,
    ) -> ProviderSettingsService:
        """Create provider settings service."""
        return ProviderSettingsService(repo, remnawave)

    @provide(scope=Scope.REQUEST)
    def get_admin_users_service(
        self,
        remnawave: RemnawaveClient,
        redis: Redis,
    ) -> AdminUsersService:
        """Create admin users service."""
        return AdminUsersService(remnawave, redis)
