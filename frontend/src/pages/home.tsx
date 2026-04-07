import type { FC } from "react";
import { useTranslation } from "react-i18next";
import { DetailSection } from "../components/home/detail-section.tsx";
import { HeroCard } from "../components/home/hero-card.tsx";
import { useSubscription } from "../hooks/use-subscription.ts";
import styles from "./home.module.css";

export const Home: FC = () => {
	const { subscription, isPending, error } = useSubscription();
	const { t } = useTranslation();

	if (isPending) {
		return (
			<div className={styles.page}>
				<p style={{ color: "var(--v2-text-secondary)" }}>{t("home.loading")}</p>
			</div>
		);
	}

	if (error) {
		return (
			<div className={styles.page}>
				<p style={{ color: "var(--v2-text-negative)" }}>{t("home.error")}</p>
			</div>
		);
	}

	if (!subscription) {
		return (
			<div className={styles.page}>
				<p style={{ color: "var(--v2-text-secondary)" }}>{t("home.noSubscription")}</p>
			</div>
		);
	}

	return (
		<div className={styles.page}>
			<HeroCard subscription={subscription} />
			<DetailSection subscription={subscription} />
		</div>
	);
};
