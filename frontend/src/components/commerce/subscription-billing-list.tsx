import { useTranslation } from "react-i18next";
import { TRIBUTE_BILLING_INTERVAL_KEYS } from "../../lib/commerce-labels.ts";
import { formatPlanMoney } from "../../lib/money.ts";
import type { SponsorOfferPriceOption } from "../../types/commerce.ts";
import styles from "./subscription-billing-list.module.css";

interface SubscriptionBillingListProps {
	options: SponsorOfferPriceOption[];
	tone?: "soft" | "plain";
}

export function SubscriptionBillingList({ options, tone = "soft" }: SubscriptionBillingListProps) {
	const { t, i18n } = useTranslation();

	return (
		<ul className={styles.list} data-tone={tone} aria-label={t("common.tributeBillingOptions")}>
			{options.map((option) => (
				<li
					className={styles.option}
					key={`${option.period ?? "once"}-${option.priceMajor}-${option.currency}`}
				>
					<strong>{formatPlanMoney(option.priceMajor, option.currency, i18n.language)}</strong>
					<span>{option.period ? t(TRIBUTE_BILLING_INTERVAL_KEYS[option.period]) : "—"}</span>
				</li>
			))}
		</ul>
	);
}
