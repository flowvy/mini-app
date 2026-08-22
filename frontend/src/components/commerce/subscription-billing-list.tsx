import { useTranslation } from "react-i18next";
import { TRIBUTE_BILLING_INTERVAL_KEYS } from "../../lib/commerce-labels.ts";
import {
	discountedMinorAmount,
	formatPlanMoney,
	majorToMinor,
	minorToMajorInput,
} from "../../lib/money.ts";
import type { SponsorOfferPriceOption } from "../../types/commerce.ts";
import styles from "./subscription-billing-list.module.css";

interface SubscriptionBillingListProps {
	options: SponsorOfferPriceOption[];
	tone?: "soft" | "plain";
	discountPercent?: number | null;
}

export function SubscriptionBillingList({
	options,
	tone = "soft",
	discountPercent = null,
}: SubscriptionBillingListProps) {
	const { t, i18n } = useTranslation();

	return (
		<ul className={styles.list} data-tone={tone} aria-label={t("common.tributeBillingOptions")}>
			{options.map((option) => {
				const original = formatPlanMoney(option.priceMajor, option.currency, i18n.language);
				const originalMinor = majorToMinor(option.priceMajor, option.currency);
				const discounted =
					discountPercent !== null && originalMinor !== null
						? formatPlanMoney(
								minorToMajorInput(
									discountedMinorAmount(originalMinor, discountPercent),
									option.currency,
								),
								option.currency,
								i18n.language,
							)
						: null;
				return (
					<li
						className={styles.option}
						key={`${option.period ?? "once"}-${option.priceMajor}-${option.currency}`}
					>
						<span className={styles.price}>
							{discounted && <del>{original}</del>}
							<strong>{discounted ?? original}</strong>
						</span>
						<span>{option.period ? t(TRIBUTE_BILLING_INTERVAL_KEYS[option.period]) : "—"}</span>
					</li>
				);
			})}
		</ul>
	);
}
