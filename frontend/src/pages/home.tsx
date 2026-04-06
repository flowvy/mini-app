import type { FC } from "react";
import { DetailSection } from "../components/home/detail-section.tsx";
import { HeroCard } from "../components/home/hero-card.tsx";
import { useSubscription } from "../hooks/use-subscription.ts";
import styles from "./home.module.css";

export const Home: FC = () => {
	const { subscription, isPending, error } = useSubscription();

	if (isPending) {
		return (
			<div className={styles.page}>
				<p style={{ color: "var(--v2-text-secondary)" }}>Loading...</p>
			</div>
		);
	}

	if (error) {
		return (
			<div className={styles.page}>
				<p style={{ color: "var(--v2-text-negative)" }}>Failed to load subscription</p>
			</div>
		);
	}

	if (!subscription) {
		return (
			<div className={styles.page}>
				<p style={{ color: "var(--v2-text-secondary)" }}>No active subscription</p>
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
