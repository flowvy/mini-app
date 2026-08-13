"""Dishka providers for BFF (Backend-for-Frontend) services."""

from __future__ import annotations

from collections.abc import AsyncIterable

import httpx
from dishka import Provider, Scope, provide
from redis.asyncio import Redis

from flowvy.beszel_target import BeszelTargetPolicy
from flowvy.config import Settings
from flowvy.kuma_target import KumaTargetPolicy
from flowvy.repositories.provider_settings import ProviderSettingsRepository
from flowvy.repositories.subscription import SubscriptionRepository
from flowvy.repositories.user import UserRepository
from flowvy.services.admin_users import AdminUsersService
from flowvy.services.beszel import BeszelClient
from flowvy.services.devices import DevicesService
from flowvy.services.kuma import UptimeKumaClient
from flowvy.services.provider_settings import ProviderSettingsService
from flowvy.services.pulse import PulseService
from flowvy.services.remnawave import RemnawaveClient
from flowvy.services.subscription import SubscriptionService
from flowvy.services.tribute import TributeClient


class BffServiceProvider(Provider):
    """Provides BFF services (REQUEST scope) and their APP-scope clients."""

    @provide(scope=Scope.APP)
    async def get_kuma(self, settings: Settings) -> AsyncIterable[UptimeKumaClient]:
        """Create a proxy-free Uptime Kuma client with no pooled connections."""
        policy = KumaTargetPolicy(settings.kuma_allowed_private_origins)
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(10.0, connect=5.0),
            follow_redirects=False,
            trust_env=False,
            limits=httpx.Limits(max_keepalive_connections=0),
        ) as http:
            yield UptimeKumaClient(
                http,
                policy,
                max_response_bytes=settings.kuma_max_response_bytes,
            )

    @provide(scope=Scope.APP)
    async def get_beszel(self, settings: Settings) -> AsyncIterable[BeszelClient]:
        """Create a proxy-free Beszel client with no pooled connections."""
        policy = BeszelTargetPolicy(settings.beszel_allowed_private_origins)
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(10.0, connect=5.0),
            follow_redirects=False,
            trust_env=False,
            limits=httpx.Limits(max_keepalive_connections=0),
        ) as http:
            yield BeszelClient(
                http,
                policy,
                email=settings.beszel_email,
                password=settings.beszel_password.get_secret_value(),
                max_response_bytes=settings.beszel_max_response_bytes,
            )

    @provide(scope=Scope.APP)
    async def get_tribute(self, settings: Settings) -> AsyncIterable[TributeClient]:
        """Create a fixed-origin Tribute client with a server-only credential."""
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(10.0, connect=5.0),
            follow_redirects=False,
            trust_env=False,
            limits=httpx.Limits(max_keepalive_connections=0),
        ) as http:
            yield TributeClient(
                http,
                api_key=settings.tribute_api_key.get_secret_value(),
                max_response_bytes=settings.tribute_max_response_bytes,
            )

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
        beszel: BeszelClient,
        ps_repo: ProviderSettingsRepository,
        redis: Redis,
    ) -> PulseService:
        """Create the provider-neutral Pulse service with Redis cache."""
        return PulseService(kuma, beszel, ps_repo, redis)

    @provide(scope=Scope.REQUEST)
    def get_provider_settings_service(
        self,
        repo: ProviderSettingsRepository,
        remnawave: RemnawaveClient,
        kuma: UptimeKumaClient,
        beszel: BeszelClient,
        tribute: TributeClient,
        redis: Redis,
    ) -> ProviderSettingsService:
        """Create provider settings service."""
        return ProviderSettingsService(repo, remnawave, kuma, beszel, tribute, redis)

    @provide(scope=Scope.REQUEST)
    def get_admin_users_service(
        self,
        remnawave: RemnawaveClient,
        redis: Redis,
        user_repo: UserRepository,
    ) -> AdminUsersService:
        """Create admin users service."""
        return AdminUsersService(remnawave, redis, user_repo)
