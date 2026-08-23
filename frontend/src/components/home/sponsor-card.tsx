import { useQueryClient } from "@tanstack/react-query";
import { ExternalLink, HeartHandshake, LockKeyhole, RefreshCw, TicketPercent } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	useAbandonSponsorCheckout,
	useSponsorState,
	useStartSponsorCheckout,
} from "../../hooks/use-sponsor.ts";
import { TRIBUTE_PERIOD_KEYS } from "../../lib/commerce-labels.ts";
import { formatExpiryDate, isUnlimitedExpiry } from "../../lib/format.ts";
import { hapticImpact } from "../../lib/haptics.ts";
import { formatMajorMoney, formatPlanMoney } from "../../lib/money.ts";
import {
	operatorFormattedText,
	operatorText,
	renderFormattedTemplate,
	renderTemplate,
} from "../../lib/operator-content.ts";
import { queryKeys } from "../../lib/query.ts";
import { openExternalDestination } from "../../lib/telegram-link.ts";
import type {
	SponsorOffer,
	SponsorPrimaryAction,
	SponsorStateStatus,
} from "../../types/commerce.ts";
import { useCurrentUser } from "../auth-guard.tsx";
import { SubscriptionBillingList } from "../commerce/subscription-billing-list.tsx";
import { FormattedText } from "../content/formatted-text.tsx";
import { ActionBtn } from "../ui/action-btn.tsx";
import { ConfirmDialog } from "../ui/confirm-dialog.tsx";
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

const PAYMENT_FEEDBACK_KEYS = {
	unchanged: "home.sponsor.paymentFeedback.unchanged",
	checkError: "home.sponsor.paymentFeedback.checkError",
	refreshError: "home.sponsor.paymentFeedback.refreshError",
	cancelled: "home.sponsor.paymentFeedback.cancelled",
	cancelError: "home.sponsor.paymentFeedback.cancelError",
} as const;

function navigateToProvider(url: string): void {
	if (!openExternalDestination(url)) window.location.assign(url);
}

export function SponsorCard() {
	const { t, i18n } = useTranslation();
	const { branding } = useCurrentUser();
	const appName = branding.appName || t("common.appName");
	const operatorContext = { appName, app_name: appName };
	const sponsor = useSponsorState();
	const checkout = useStartSponsorCheckout();
	const abandonCheckout = useAbandonSponsorCheckout();
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
	const [checkingPayment, setCheckingPayment] = useState(false);
	const [paymentFeedback, setPaymentFeedback] = useState<
		"unchanged" | "checkError" | "refreshError" | "cancelled" | "cancelError" | null
	>(null);
	const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
	const cancelAttemptRef = useRef<HTMLButtonElement>(null);

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

	if (sponsor.isError && !sponsor.data) {
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
	const stateTitle =
		state.status === "no_access"
			? operatorText(branding.content, "sponsorNoAccessTitle", t(stateCopy.title), operatorContext)
			: state.status === "base_access"
				? operatorText(
						branding.content,
						"sponsorBaseAccessTitle",
						t(stateCopy.title),
						operatorContext,
					)
				: t(stateCopy.title);
	const stateDescription =
		state.status === "no_access"
			? operatorFormattedText(
					branding.content,
					"sponsorNoAccessDescription",
					t(stateCopy.description, { appName }),
					operatorContext,
				)
			: state.status === "base_access"
				? operatorFormattedText(
						branding.content,
						"sponsorBaseAccessDescription",
						t(stateCopy.description, { appName }),
						operatorContext,
					)
				: t(stateCopy.description, { appName });
	const refreshOnly = state.primaryAction === "refresh";
	const refreshAccess = async () => {
		setPaymentFeedback(null);
		const result = await sponsor.refetch();
		if (result.isError) {
			setPaymentFeedback("refreshError");
			return;
		}
		await queryClient.invalidateQueries({ queryKey: queryKeys.subscription });
	};
	const checkPaymentStatus = async () => {
		setPaymentFeedback(null);
		setCheckingPayment(true);
		try {
			const result = await sponsor.refetch();
			await queryClient.invalidateQueries({ queryKey: queryKeys.subscription });
			setPaymentFeedback(
				result.isError
					? "checkError"
					: result.data?.status === "checkout_pending"
						? "unchanged"
						: null,
			);
		} finally {
			setCheckingPayment(false);
		}
	};
	const confirmAbandonCheckout = async () => {
		if (!state.pendingCheckout) return;
		setPaymentFeedback(null);
		try {
			await abandonCheckout.mutateAsync(state.pendingCheckout.id);
			setCancelDialogOpen(false);
			setPaymentFeedback("cancelled");
		} catch {
			setCancelDialogOpen(false);
			setPaymentFeedback("cancelError");
		}
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
		setPaymentFeedback(null);
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
				period: t(TRIBUTE_PERIOD_KEYS[offer.expectedProviderPeriod]),
			});
		}
		return t("home.sponsor.nonAnonymousWarning");
	};

	const renderOffer = (offer: SponsorOffer, blocked = false) => {
		const instruction = donationInstruction(offer);
		const isSubscription = offer.commerceType === "subscription";
		const donationPrice = !isSubscription ? offer.priceOptions[0] : null;
		const offerTitle = renderTemplate(offer.title, operatorContext);
		const offerDescription = renderFormattedTemplate(offer.description, operatorContext);
		const welcomeDiscountPercent = offer.welcomeDiscount ? offer.welcomeDiscountPercent : null;
		return (
			<article
				className={styles.offerCard}
				key={offer.id}
				data-blocked={blocked ? "true" : undefined}
				aria-label={offerTitle}
			>
				<div className={styles.offerHeader}>
					<strong className={styles.offerTitle}>{offerTitle}</strong>
					{offerDescription && (
						<FormattedText className={styles.offerDescription}>{offerDescription}</FormattedText>
					)}
				</div>

				{isSubscription ? (
					<>
						{welcomeDiscountPercent !== null && (
							<div className={styles.welcomeDiscount} data-ui="welcome-discount">
								<span
									className={styles.welcomeDiscountIcon}
									data-ui="welcome-discount-icon"
									aria-hidden="true"
								>
									<TicketPercent data-ui="welcome-discount-ticket-icon" size={20} />
								</span>
								<span>
									<strong>
										{t("home.sponsor.welcomeDiscountTitle", {
											percent: welcomeDiscountPercent,
										})}
									</strong>
									<small>{t("home.sponsor.welcomeDiscountDescription")}</small>
								</span>
							</div>
						)}
						<SubscriptionBillingList
							options={offer.priceOptions}
							discountPercent={welcomeDiscountPercent}
						/>
						<p className={styles.providerSelectionHint}>
							{t(
								welcomeDiscountPercent === null
									? "home.sponsor.subscriptionPeriodHint"
									: "home.sponsor.welcomeDiscountFinal",
							)}
						</p>
					</>
				) : (
					donationPrice && (
						<div className={styles.donationPrice} data-ui="sponsor-donation-price">
							<strong>
								{formatPlanMoney(donationPrice.priceMajor, donationPrice.currency, i18n.language)}
							</strong>
							<span>
								{donationPrice.period
									? t(TRIBUTE_PERIOD_KEYS[donationPrice.period])
									: t("home.sponsor.donationOnce")}
							</span>
						</div>
					)
				)}

				{offer.requiresNonAnonymous && instruction && (
					<p className={styles.offerInstruction}>{instruction}</p>
				)}

				<ActionBtn
					variant={blocked ? "action" : "confirm"}
					size="md"
					className={styles.offerAction}
					disabled={blocked || checkout.isPending}
					aria-describedby={blocked ? "other-subscriptions-warning" : undefined}
					onClick={blocked ? undefined : () => void startCheckout(offer)}
				>
					{blocked ? (
						<LockKeyhole size={14} aria-hidden="true" />
					) : (
						<ExternalLink size={14} aria-hidden="true" />
					)}
					{welcomeDiscountPercent !== null && !blocked
						? t("home.sponsor.welcomeDiscountAction", { percent: welcomeDiscountPercent })
						: t(
								blocked
									? "home.sponsor.offerAction.locked"
									: isSubscription
										? "home.sponsor.action.continue"
										: "home.sponsor.offerAction.donation",
							)}
				</ActionBtn>
			</article>
		);
	};

	return (
		<section className={styles.card} aria-labelledby="sponsor-card-title">
			<div className={styles.heading}>
				<div>
					<h2 id="sponsor-card-title" className={styles.title}>
						{stateTitle}
					</h2>
					<FormattedText className={styles.description}>{stateDescription}</FormattedText>
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
				<div className={styles.accessFact} data-ui="sponsor-access-fact">
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
					{state.primaryAction === "choose_offer"
						? operatorText(branding.content, "sponsorChooseAction", t(actionLabel), operatorContext)
						: t(actionLabel)}
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
				<div className={styles.pendingActions}>
					<ActionBtn
						variant="action"
						size="md"
						className={styles.pendingAction}
						loading={checkingPayment}
						disabled={abandonCheckout.isPending}
						onClick={() => void checkPaymentStatus()}
					>
						<RefreshCw size={13} aria-hidden="true" /> {t("home.sponsor.checkStatus")}
					</ActionBtn>
					<ActionBtn
						ref={cancelAttemptRef}
						variant="ghost"
						size="sm"
						disabled={checkingPayment || abandonCheckout.isPending}
						onClick={() => setCancelDialogOpen(true)}
					>
						{t("home.sponsor.cancelAttempt.action")}
					</ActionBtn>
				</div>
			)}

			{paymentFeedback && (
				<InlineFeedback
					attention={
						paymentFeedback === "checkError" ||
						paymentFeedback === "refreshError" ||
						paymentFeedback === "cancelError"
							? "action"
							: "passive"
					}
					tone={
						paymentFeedback === "unchanged"
							? "info"
							: paymentFeedback === "cancelled"
								? "success"
								: "error"
					}
				>
					{t(PAYMENT_FEEDBACK_KEYS[paymentFeedback], { appName })}
				</InlineFeedback>
			)}

			{offersVisible && state.offers.length > 0 && (
				<div className={styles.offers}>
					{state.offers.map((offer) => renderOffer(offer))}
					<p className={styles.checkoutNotice}>{t("home.sponsor.checkoutNotice", { appName })}</p>
				</div>
			)}

			{checkout.isError && (
				<InlineFeedback attention="action">
					{t("home.sponsor.checkoutError", { appName })}
				</InlineFeedback>
			)}

			<ConfirmDialog
				open={cancelDialogOpen}
				title={t("home.sponsor.cancelAttempt.title")}
				confirmLabel={t("home.sponsor.cancelAttempt.confirm")}
				cancelLabel={t("common.cancel")}
				confirmLoading={abandonCheckout.isPending}
				initialFocus="title"
				onConfirm={() => void confirmAbandonCheckout()}
				onCancel={() => setCancelDialogOpen(false)}
				returnFocusRef={cancelAttemptRef}
			>
				<p>{t("home.sponsor.cancelAttempt.description", { appName })}</p>
			</ConfirmDialog>
		</section>
	);
}
