import { ExternalLink, Gauge, LockKeyhole, MonitorSmartphone, TicketPercent } from "lucide-react";
import { useTranslation } from "react-i18next";
import { TRIBUTE_PERIOD_KEYS } from "../../lib/commerce-labels.ts";
import { formatTraffic, isUnlimitedTraffic } from "../../lib/format.ts";
import { formatMajorMoney, formatPlanMoney } from "../../lib/money.ts";
import { renderFormattedTemplate, renderTemplate } from "../../lib/operator-content.ts";
import type { SponsorOfferPresentation } from "../../types/commerce.ts";
import { useCurrentUser } from "../auth-guard.tsx";
import { FormattedText } from "../content/formatted-text.tsx";
import styles from "../home/sponsor-card.module.css";
import { ActionBtn } from "../ui/action-btn.tsx";
import { SubscriptionBillingList } from "./subscription-billing-list.tsx";

interface SponsorOfferCardProps {
	offer: SponsorOfferPresentation;
	blocked?: boolean;
	busy?: boolean;
	preview?: boolean;
	ariaDescribedBy?: string;
	onSelect?: (offer: SponsorOfferPresentation) => void;
}

export function SponsorOfferCard({
	offer,
	blocked = false,
	busy = false,
	preview = false,
	ariaDescribedBy,
	onSelect,
}: SponsorOfferCardProps) {
	const { t, i18n } = useTranslation();
	const { branding } = useCurrentUser();
	const appName = branding.appName || t("common.appName");
	const operatorContext = { appName, app_name: appName };
	const isSubscription = offer.commerceType === "subscription";
	const donationPrice = !isSubscription ? offer.priceOptions[0] : null;
	const offerTitle = renderTemplate(offer.title, operatorContext);
	const offerDescription = renderFormattedTemplate(offer.description, operatorContext);
	const welcomeDiscountPercent = offer.welcomeDiscount ? offer.welcomeDiscountPercent : null;
	const unlimitedTraffic = isUnlimitedTraffic(offer.benefits.trafficLimitBytes);
	const unlimitedDevices = !offer.benefits.deviceLimit;
	let instruction: string | null = null;
	if (!isSubscription && donationPrice) {
		const amount = formatMajorMoney(
			donationPrice.priceMajor,
			donationPrice.currency,
			i18n.language,
		);
		if (offer.expectedPaymentMode === "one_time") {
			instruction = t("home.sponsor.donationInstruction.oneTime", { amount });
		} else if (offer.expectedPaymentMode === "recurring" && offer.expectedProviderPeriod) {
			instruction = t("home.sponsor.donationInstruction.recurring", {
				amount,
				period: t(TRIBUTE_PERIOD_KEYS[offer.expectedProviderPeriod]),
			});
		} else {
			instruction = t("home.sponsor.nonAnonymousWarning");
		}
	}

	return (
		<article
			className={styles.offerCard}
			data-blocked={blocked ? "true" : undefined}
			data-preview={preview ? "true" : undefined}
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

			<section className={styles.benefits} aria-label={t("home.sponsor.benefits.label")}>
				<div className={styles.benefit}>
					<Gauge size={16} aria-hidden="true" />
					<span>{t("home.sponsor.benefits.traffic")}</span>
					<strong>
						{unlimitedTraffic
							? t("home.sponsor.benefits.unlimited")
							: formatTraffic(offer.benefits.trafficLimitBytes)}
					</strong>
				</div>
				<div className={styles.benefit}>
					<MonitorSmartphone size={16} aria-hidden="true" />
					<span>{t("home.sponsor.benefits.devices")}</span>
					<strong>
						{unlimitedDevices ? t("home.sponsor.benefits.unlimited") : offer.benefits.deviceLimit}
					</strong>
				</div>
			</section>

			<ActionBtn
				variant={blocked ? "action" : "confirm"}
				size="md"
				className={styles.offerAction}
				disabled={!preview && (blocked || busy)}
				aria-disabled={preview || undefined}
				aria-describedby={blocked ? ariaDescribedBy : undefined}
				tabIndex={preview ? -1 : undefined}
				onClick={preview || blocked || !onSelect ? undefined : () => onSelect(offer)}
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
}
