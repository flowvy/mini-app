import { useQueryClient } from "@tanstack/react-query";
import { ExternalLink, HeartHandshake, LockKeyhole, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSponsorState, useStartSponsorCheckout } from "../../hooks/use-sponsor.ts";
import { formatExpiryDate, isUnlimitedExpiry } from "../../lib/format.ts";
import { hapticImpact } from "../../lib/haptics.ts";
import { formatMajorMoney } from "../../lib/money.ts";
import { queryKeys } from "../../lib/query.ts";
import { openExternalDestination } from "../../lib/telegram-link.ts";
import type {
	SponsorOffer,
	SponsorPrimaryAction,
	SponsorStateStatus,
	TributeSubscriptionPeriod,
} from "../../types/commerce.ts";
import { useCurrentUser } from "../auth-guard.tsx";
import { ActionBtn } from "../ui/action-btn.tsx";
import { InlineFeedback } from "../ui/inline-feedback.tsx";
import { Skeleton } from "../ui/skeleton.tsx";
import styles from "./sponsor-card.module.css";

const STATE_KEYS: Record<SponsorStateStatus, { title: string; description: string }> = {
	no_access: {
		title: "home.sponsor.state.noAccess.title",
		description: "home.sponsor.state.noAccess.description",
	},
	base_access: {
		title: "home.sponsor.state.baseAccess.title",
		description: "home.sponsor.state.baseAccess.description",
	},
	checkout_pending: {
		title: "home.sponsor.state.checkoutPending.title",
		description: "home.sponsor.state.checkoutPending.description",
	},
	provisioning: {
		title: "home.sponsor.state.provisioning.title",
		description: "home.sponsor.state.provisioning.description",
	},
	attention: {
		title: "home.sponsor.state.attention.title",
		description: "home.sponsor.state.attention.description",
	},
	one_time_active: {
		title: "home.sponsor.state.oneTimeActive.title",
		description: "home.sponsor.state.oneTimeActive.description",
	},
	one_time_expired: {
		title: "home.sponsor.state.oneTimeExpired.title",
		description: "home.sponsor.state.oneTimeExpired.description",
	},
	recurring_trial: {
		title: "home.sponsor.state.recurringTrial.title",
		description: "home.sponsor.state.recurringTrial.description",
	},
	recurring_active: {
		title: "home.sponsor.state.recurringActive.title",
		description: "home.sponsor.state.recurringActive.description",
	},
	recurring_donation_active: {
		title: "home.sponsor.state.recurringDonationActive.title",
		description: "home.sponsor.state.recurringDonationActive.description",
	},
	recurring_cancelled_active: {
		title: "home.sponsor.state.recurringCancelled.title",
		description: "home.sponsor.state.recurringCancelled.description",
	},
	recurring_expired: {
		title: "home.sponsor.state.recurringExpired.title",
		description: "home.sponsor.state.recurringExpired.description",
	},
	refunded: {
		title: "home.sponsor.state.refunded.title",
		description: "home.sponsor.state.refunded.description",
	},
};

const ACTION_KEYS: Partial<Record<SponsorPrimaryAction, string>> = {
	choose_offer: "home.sponsor.action.choose",
	continue_checkout: "home.sponsor.action.continue",
	refresh: "home.sponsor.action.refresh",
	renew: "home.sponsor.action.renew",
	manage_subscription: "home.sponsor.action.manage",
	manage_auto_donation: "home.sponsor.action.manageAutoDonation",
	resume_recurring: "home.sponsor.action.resume",
};

const PERIOD_KEYS: Record<TributeSubscriptionPeriod, string> = {
	trial: "settings.tribute.rules.period.trial",
	onetime: "settings.tribute.rules.period.onetime",
	weekly: "settings.tribute.rules.period.weekly",
	monthly: "settings.tribute.rules.period.monthly",
	quarterly: "settings.tribute.rules.period.quarterly",
	halfyearly: "settings.tribute.rules.period.halfyearly",
	yearly: "settings.tribute.rules.period.yearly",
};

const TYPE_KEYS: Record<SponsorOffer["commerceType"], string> = {
	donation: "home.sponsor.type.donation",
	subscription: "home.sponsor.type.subscription",
};

function navigateToProvider(url: string): void {
	if (!openExternalDestination(url)) window.location.assign(url);
}

export function SponsorCard() {
	const { t, i18n } = useTranslation();
	const { branding } = useCurrentUser();
	const appName = branding.appName || t("common.appName");
	const sponsor = useSponsorState();
	const checkout = useStartSponsorCheckout();
	const queryClient = useQueryClient();
	const state = sponsor.data;
	const blockedSubscriptionOffers =
		state && ["recurring_active", "recurring_trial"].includes(state.status)
			? state.offers.filter(
					(offer) => offer.commerceType === "subscription" && offer.id !== state.currentOfferId,
				)
			: [];
	const chooserAction =
		state?.primaryAction === "choose_offer" ||
		state?.primaryAction === "renew" ||
		state?.primaryAction === "resume_recurring";
	const [offersVisible, setOffersVisible] = useState(state?.primaryAction === "choose_offer");

	useEffect(() => {
		if (state?.primaryAction === "choose_offer") setOffersVisible(true);
		if (!chooserAction) setOffersVisible(false);
	}, [chooserAction, state?.primaryAction]);

	if (sponsor.isPending) {
		return (
			<section className={styles.card} aria-label={t("home.sponsor.loadingLabel")}>
				<div className={styles.heading}>
					<Skeleton width="52%" height={16} radius={4} />
					<Skeleton width={34} height={34} radius={8} />
				</div>
				<Skeleton width="88%" height={11} radius={4} />
				<Skeleton width="100%" height={44} radius={8} />
			</section>
		);
	}

	if (sponsor.isError) {
		return (
			<section className={styles.card}>
				<div className={styles.heading}>
					<div>
						<h2 className={styles.title}>{t("home.sponsor.unavailableTitle")}</h2>
						<p className={styles.description}>{t("home.sponsor.unavailableDescription")}</p>
					</div>
					<span className={styles.icon} aria-hidden="true">
						<HeartHandshake size={18} />
					</span>
				</div>
				<ActionBtn variant="action" size="md" onClick={() => sponsor.refetch()}>
					<RefreshCw size={14} aria-hidden="true" /> {t("common.retry")}
				</ActionBtn>
			</section>
		);
	}

	if (
		!state ||
		(state.offers.length === 0 && ["no_access", "base_access"].includes(state.status))
	) {
		return null;
	}

	const stateCopy = STATE_KEYS[state.status];
	const date = state.paidExpiresAt ?? state.baseExpiresAt;
	const noExpiry = date ? isUnlimitedExpiry(date) : false;
	const actionLabel = ACTION_KEYS[state.primaryAction];
	const refreshOnly = state.primaryAction === "refresh";
	const refreshAccess = async () => {
		await sponsor.refetch();
		await queryClient.invalidateQueries({ queryKey: queryKeys.subscription });
	};

	const handlePrimaryAction = () => {
		hapticImpact("light");
		if (chooserAction) {
			setOffersVisible((current) => !current);
			return;
		}
		if (state.primaryAction === "continue_checkout" && state.pendingCheckout) {
			navigateToProvider(state.pendingCheckout.checkoutUrl);
			return;
		}
		if (
			["manage_subscription", "manage_auto_donation"].includes(state.primaryAction) &&
			state.managementUrl
		) {
			navigateToProvider(state.managementUrl);
			return;
		}
		if (refreshOnly) void refreshAccess();
	};

	const startCheckout = async (offer: SponsorOffer) => {
		try {
			const attempt = await checkout.mutateAsync(offer.id);
			hapticImpact("medium");
			navigateToProvider(attempt.checkoutUrl);
		} catch {
			// The localized inline error below keeps the user in Flowvy without opening a stale URL.
		}
	};

	const donationInstruction = (offer: SponsorOffer): string | null => {
		if (offer.commerceType !== "donation" || offer.priceOptions.length === 0) return null;
		const price = offer.priceOptions[0];
		const amount = formatMajorMoney(price.priceMajor, price.currency, i18n.language);
		if (offer.expectedPaymentMode === "one_time") {
			return t("home.sponsor.donationInstruction.oneTime", { amount });
		}
		if (offer.expectedPaymentMode === "recurring" && offer.expectedProviderPeriod) {
			return t("home.sponsor.donationInstruction.recurring", {
				amount,
				period: t(PERIOD_KEYS[offer.expectedProviderPeriod]),
			});
		}
		return t("home.sponsor.nonAnonymousWarning");
	};

	const renderOffer = (offer: SponsorOffer, blocked = false) => {
		const instruction = donationInstruction(offer);
		return (
			<button
				type="button"
				className={styles.offer}
				key={offer.id}
				disabled={blocked || checkout.isPending}
				aria-describedby={blocked ? "other-subscriptions-warning" : undefined}
				onClick={blocked ? undefined : () => void startCheckout(offer)}
			>
				<span className={styles.offerCopy}>
					<span className={styles.offerTitleLine}>
						<strong>{offer.title}</strong>
						<small>{t(TYPE_KEYS[offer.commerceType])}</small>
					</span>
					{offer.description && <span>{offer.description}</span>}
					<span className={styles.prices}>
						{offer.priceOptions.map((price) => (
							<b key={`${price.priceMajor}-${price.currency}-${price.period ?? "once"}`}>
								{formatMajorMoney(price.priceMajor, price.currency, i18n.language)}
								{price.period ? ` / ${t(PERIOD_KEYS[price.period])}` : ""}
							</b>
						))}
					</span>
					{offer.requiresNonAnonymous && instruction && <em>{instruction}</em>}
				</span>
				{blocked ? (
					<LockKeyhole size={15} aria-hidden="true" />
				) : (
					<ExternalLink size={15} aria-hidden="true" />
				)}
			</button>
		);
	};

	return (
		<section className={styles.card} aria-labelledby="sponsor-card-title">
			<div className={styles.heading}>
				<div>
					<h2 id="sponsor-card-title" className={styles.title}>
						{t(stateCopy.title)}
					</h2>
					<p className={styles.description}>{t(stateCopy.description, { appName })}</p>
				</div>
				<span
					className={styles.icon}
					data-status={state.status}
					data-active={state.accessLevel === "paid" ? "true" : undefined}
					aria-hidden="true"
				>
					<HeartHandshake size={18} />
				</span>
			</div>

			{date && (
				<div className={styles.accessFact}>
					<span>
						{t(
							state.paidExpiresAt
								? noExpiry
									? "home.sponsor.sponsorAccess"
									: "home.sponsor.sponsorAccessUntil"
								: noExpiry
									? "home.sponsor.baseAccess"
									: "home.sponsor.baseAccessUntil",
						)}
					</span>
					<strong>{formatExpiryDate(date)}</strong>
				</div>
			)}

			{actionLabel && !(state.primaryAction === "choose_offer" && offersVisible) && (
				<ActionBtn
					variant={refreshOnly ? "action" : "confirm"}
					size="md"
					className={styles.primaryAction}
					loading={refreshOnly && sponsor.isFetching}
					onClick={handlePrimaryAction}
				>
					{refreshOnly ? (
						<RefreshCw size={14} aria-hidden="true" />
					) : (
						<ExternalLink size={14} aria-hidden="true" />
					)}
					{t(actionLabel)}
				</ActionBtn>
			)}

			{state.status === "recurring_donation_active" && (
				<p className={styles.checkoutNotice} role="note">
					{t("home.sponsor.recurringDonationCancellationTiming", { appName })}
				</p>
			)}

			{["recurring_active", "recurring_trial"].includes(state.status) && (
				<p className={styles.checkoutNotice} role="note">
					{t("home.sponsor.subscriptionStatusTiming", { appName })}
				</p>
			)}

			{blockedSubscriptionOffers.length > 0 && state.paidExpiresAt && (
				<div className={styles.offers}>
					<h3 className={styles.offerGroupTitle}>{t("home.sponsor.otherSubscriptionsTitle")}</h3>
					<InlineFeedback id="other-subscriptions-warning" tone="warning">
						{t("home.sponsor.otherSubscriptionsWarning", {
							date: formatExpiryDate(state.paidExpiresAt),
						})}
					</InlineFeedback>
					{blockedSubscriptionOffers.map((offer) => renderOffer(offer, true))}
				</div>
			)}

			{state.primaryAction === "continue_checkout" && (
				<ActionBtn
					variant="ghost"
					size="sm"
					className={styles.refreshAction}
					onClick={() => void refreshAccess()}
				>
					<RefreshCw size={13} aria-hidden="true" /> {t("home.sponsor.checkStatus")}
				</ActionBtn>
			)}

			{offersVisible && state.offers.length > 0 && (
				<div className={styles.offers}>
					{state.offers.map((offer) => renderOffer(offer))}
					<p className={styles.checkoutNotice}>{t("home.sponsor.checkoutNotice", { appName })}</p>
				</div>
			)}

			{checkout.isError && (
				<InlineFeedback>{t("home.sponsor.checkoutError", { appName })}</InlineFeedback>
			)}
		</section>
	);
}
