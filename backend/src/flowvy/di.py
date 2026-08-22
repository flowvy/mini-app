"""Dishka dependency injection providers."""

from __future__ import annotations

from collections.abc import AsyncIterable

import httpx
from dishka import Provider, Scope, provide
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from flowvy.config import Settings
from flowvy.repositories.access_profile import AccessProfileRepository
from flowvy.repositories.commerce_rule import CommerceRuleRepository
from flowvy.repositories.entitlement_baseline import EntitlementBaselineRepository
from flowvy.repositories.entitlement_operation import EntitlementOperationRepository
from flowvy.repositories.entitlement_operation_action import (
    EntitlementOperationActionRepository,
)
from flowvy.repositories.invite import InviteRepository
from flowvy.repositories.provider_settings import ProviderSettingsRepository
from flowvy.repositories.referral_conversion import ReferralConversionRepository
from flowvy.repositories.sponsor_checkout import SponsorCheckoutRepository
from flowvy.repositories.sponsor_offer import SponsorOfferRepository
from flowvy.repositories.subscription import SubscriptionRepository
from flowvy.repositories.tribute_webhook_event import TributeWebhookEventRepository
from flowvy.repositories.user import UserRepository
from flowvy.services.commerce import CommerceRuleService
from flowvy.services.commerce_catalog import CommerceCatalogService
from flowvy.services.entitlements import EntitlementJournalService
from flowvy.services.registration import RegistrationAdminService, RegistrationService
from flowvy.services.remnawave import RemnawaveClient
from flowvy.services.sponsor import SponsorOfferService, SponsorStateService
from flowvy.services.tribute import TributeClient
from flowvy.services.user import UserService


class ConfigProvider(Provider):
    """Provides application settings."""

    @provide(scope=Scope.APP)
    def get_settings(self) -> Settings:
        """Load settings from environment."""
        return Settings()


class DatabaseProvider(Provider):
    """Provides SQLAlchemy async engine and session."""

    @provide(scope=Scope.APP)
    async def get_engine(self, settings: Settings) -> AsyncIterable[AsyncEngine]:
        """Create async engine, dispose on shutdown."""
        engine = create_async_engine(settings.database_url)
        yield engine
        await engine.dispose()

    @provide(scope=Scope.APP)
    def get_sessionmaker(
        self,
        engine: AsyncEngine,
    ) -> async_sessionmaker[AsyncSession]:
        """Create session factory bound to engine."""
        return async_sessionmaker(engine, expire_on_commit=False)

    @provide(scope=Scope.REQUEST)
    async def get_session(
        self,
        factory: async_sessionmaker[AsyncSession],
    ) -> AsyncIterable[AsyncSession]:
        """Yield a session, commit on success, rollback on error."""
        async with factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise


class RepositoryProvider(Provider):
    """Provides data-access repositories."""

    @provide(scope=Scope.REQUEST)
    def get_user_repo(self, session: AsyncSession) -> UserRepository:
        """Create user repository bound to current session."""
        return UserRepository(session)

    @provide(scope=Scope.REQUEST)
    def get_invite_repo(self, session: AsyncSession) -> InviteRepository:
        """Create invite repository bound to current session."""
        return InviteRepository(session)

    @provide(scope=Scope.REQUEST)
    def get_access_profile_repo(self, session: AsyncSession) -> AccessProfileRepository:
        """Create access-profile repository bound to current session."""
        return AccessProfileRepository(session)

    @provide(scope=Scope.REQUEST)
    def get_commerce_rule_repo(self, session: AsyncSession) -> CommerceRuleRepository:
        """Create commerce-rule repository bound to current session."""
        return CommerceRuleRepository(session)

    @provide(scope=Scope.REQUEST)
    def get_entitlement_operation_repo(
        self,
        session: AsyncSession,
    ) -> EntitlementOperationRepository:
        """Create entitlement-operation repository bound to current session."""
        return EntitlementOperationRepository(session)

    @provide(scope=Scope.REQUEST)
    def get_entitlement_operation_action_repo(
        self,
        session: AsyncSession,
    ) -> EntitlementOperationActionRepository:
        """Create entitlement operator-action repository bound to this request."""
        return EntitlementOperationActionRepository(session)

    @provide(scope=Scope.REQUEST)
    def get_entitlement_baseline_repo(
        self,
        session: AsyncSession,
    ) -> EntitlementBaselineRepository:
        return EntitlementBaselineRepository(session)

    @provide(scope=Scope.REQUEST)
    def get_sponsor_offer_repo(self, session: AsyncSession) -> SponsorOfferRepository:
        return SponsorOfferRepository(session)

    @provide(scope=Scope.REQUEST)
    def get_sponsor_checkout_repo(self, session: AsyncSession) -> SponsorCheckoutRepository:
        return SponsorCheckoutRepository(session)

    @provide(scope=Scope.REQUEST)
    def get_subscription_repo(
        self,
        session: AsyncSession,
    ) -> SubscriptionRepository:
        """Create subscription repository bound to current session."""
        return SubscriptionRepository(session)

    @provide(scope=Scope.REQUEST)
    def get_provider_settings_repo(
        self,
        session: AsyncSession,
    ) -> ProviderSettingsRepository:
        """Create provider settings repository bound to current session."""
        return ProviderSettingsRepository(session)

    @provide(scope=Scope.REQUEST)
    def get_referral_conversion_repo(
        self,
        session: AsyncSession,
    ) -> ReferralConversionRepository:
        """Create referral-conversion repository bound to current session."""
        return ReferralConversionRepository(session)


class ServiceProvider(Provider):
    """Provides business-logic services."""

    @provide(scope=Scope.REQUEST)
    def get_user_service(
        self,
        repo: UserRepository,
        settings: Settings,
    ) -> UserService:
        """Create user service with injected repository and settings."""
        return UserService(repo, settings)

    @provide(scope=Scope.REQUEST)
    def get_commerce_rule_service(
        self,
        rules: CommerceRuleRepository,
        profiles: AccessProfileRepository,
        offers: SponsorOfferRepository,
    ) -> CommerceRuleService:
        """Create side-effect-free commerce-rule administration service."""
        return CommerceRuleService(rules, profiles, offers)

    @provide(scope=Scope.REQUEST)
    def get_commerce_catalog_service(
        self,
        tribute: TributeClient,
    ) -> CommerceCatalogService:
        """Create the provider catalog normalization service."""
        return CommerceCatalogService(tribute)

    @provide(scope=Scope.REQUEST)
    def get_entitlement_journal_service(
        self,
        operations: EntitlementOperationRepository,
        actions: EntitlementOperationActionRepository,
    ) -> EntitlementJournalService:
        """Create the administrator entitlement journal and action service."""
        return EntitlementJournalService(operations, actions)

    @provide(scope=Scope.REQUEST)
    def get_sponsor_offer_service(
        self,
        offers: SponsorOfferRepository,
        rules: CommerceRuleRepository,
        profiles: AccessProfileRepository,
        provider_settings: ProviderSettingsRepository,
        catalog: CommerceCatalogService,
    ) -> SponsorOfferService:
        return SponsorOfferService(
            offers,
            rules,
            profiles,
            provider_settings,
            catalog,
        )

    @provide(scope=Scope.REQUEST)
    def get_sponsor_state_service(
        self,
        offers: SponsorOfferService,
        offer_repository: SponsorOfferRepository,
        checkouts: SponsorCheckoutRepository,
        operations: EntitlementOperationRepository,
        events: TributeWebhookEventRepository,
        baselines: EntitlementBaselineRepository,
        subscriptions: SubscriptionRepository,
        users: UserRepository,
        provider_settings: ProviderSettingsRepository,
        config: Settings,
    ) -> SponsorStateService:
        return SponsorStateService(
            offers,
            offer_repository,
            checkouts,
            operations,
            events,
            baselines,
            subscriptions,
            users,
            provider_settings,
            config,
        )

    @provide(scope=Scope.REQUEST)
    def get_registration_service(
        self,
        session: AsyncSession,
        users: UserService,
        invites: InviteRepository,
        profiles: AccessProfileRepository,
        provider_settings: ProviderSettingsRepository,
        subscriptions: SubscriptionRepository,
        remnawave: RemnawaveClient,
        redis: Redis,
        config: Settings,
    ) -> RegistrationService:
        """Create registration orchestrator for bot and BFF requests."""
        return RegistrationService(
            session,
            users,
            invites,
            profiles,
            provider_settings,
            subscriptions,
            remnawave,
            redis,
            config,
        )

    @provide(scope=Scope.REQUEST)
    def get_registration_admin_service(
        self,
        profiles: AccessProfileRepository,
        settings: ProviderSettingsRepository,
        remnawave: RemnawaveClient,
    ) -> RegistrationAdminService:
        """Create admin configuration service for registration."""
        return RegistrationAdminService(profiles, settings, remnawave)


class RedisProvider(Provider):
    """Provides Redis async client."""

    @provide(scope=Scope.APP)
    async def get_redis(self, settings: Settings) -> AsyncIterable[Redis]:
        """Create Redis client, close on shutdown."""
        client: Redis = Redis.from_url(settings.redis_url)
        yield client
        await client.aclose()


class HttpClientProvider(Provider):
    """Provides a shared httpx.AsyncClient."""

    @provide(scope=Scope.APP)
    async def get_http(self) -> AsyncIterable[httpx.AsyncClient]:
        """Create httpx client with 10s timeout, close on shutdown."""
        client = httpx.AsyncClient(timeout=httpx.Timeout(10.0))
        yield client
        await client.aclose()


class RemnawaveProvider(Provider):
    """Provides RemnawaveClient (APP scope)."""

    @provide(scope=Scope.APP)
    def get_remnawave(
        self,
        settings: Settings,
        http: httpx.AsyncClient,
    ) -> RemnawaveClient:
        """Create Remnawave API client."""
        return RemnawaveClient(
            base_url=settings.remnawave_url,
            token=settings.remnawave_api_token,
            http=http,
        )
