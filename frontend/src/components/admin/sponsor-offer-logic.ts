import type { CommerceRule, SponsorOffer } from "../../types/commerce.ts";

export function canPublishSponsorOffer(
	rule: CommerceRule | undefined,
	donationConfigured = true,
	subscriptionConfigured = true,
): boolean {
	return Boolean(
		rule?.isEnabled &&
			(rule.commerceType !== "donation" || donationConfigured) &&
			(rule.commerceType !== "subscription" || subscriptionConfigured),
	);
}

export function hasPublishedSubscriptionOffer(
	offers: SponsorOffer[],
	externalItemId: string | null,
	exceptOfferId?: string,
): boolean {
	return Boolean(
		externalItemId &&
			offers.some(
				(offer) =>
					offer.id !== exceptOfferId &&
					offer.isPublished &&
					offer.commerceType === "subscription" &&
					offer.externalItemId === externalItemId,
			),
	);
}
