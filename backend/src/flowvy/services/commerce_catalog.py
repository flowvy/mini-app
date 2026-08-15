"""Provider catalog normalization for commerce administration."""

from __future__ import annotations

from flowvy.schemas.commerce import (
    CommerceCatalogResponse,
    CommerceCatalogSubscription,
    CommerceCatalogSubscriptionPeriod,
)
from flowvy.services.tribute import TributeClient, TributeError


class CommerceCatalogUnavailableError(RuntimeError):
    """The read-only provider catalog cannot be loaded safely."""


class CommerceCatalogService:
    """Expose an allow-listed catalog without leaking provider credentials or bodies."""

    def __init__(self, tribute: TributeClient) -> None:
        self._tribute = tribute

    async def get_tribute(self) -> CommerceCatalogResponse:
        try:
            catalog = await self._tribute.get_catalog()
        except TributeError as exc:
            raise CommerceCatalogUnavailableError("Tribute catalog is unavailable") from exc

        return CommerceCatalogResponse(
            subscriptions=[
                CommerceCatalogSubscription(
                    external_item_id=str(subscription.subscription_id),
                    name=subscription.name,
                    currency=subscription.currency,
                    periods=[
                        CommerceCatalogSubscriptionPeriod(
                            period_id=str(period.period_id),
                            period=period.period,
                            price_major=format(period.price, "f"),
                        )
                        for period in subscription.periods
                    ],
                )
                for subscription in catalog.subscriptions
            ],
        )


__all__ = ["CommerceCatalogService", "CommerceCatalogUnavailableError"]
