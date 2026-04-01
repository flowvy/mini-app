import type { FC } from "react";
import { DetailSection } from "../components/home/detail-section.tsx";
import { HeroCard } from "../components/home/hero-card.tsx";
import { useSubscription } from "../hooks/use-subscription.ts";
import styles from "./home.module.css";

export const Home: FC = () => {
	const { subscription, isLoading } = useSubscription();

	if (isLoading || !subscription) {
		return (
			<div className={styles.page}>
				<p style={{ color: "var(--v2-text-secondary)" }}>Loading...</p>
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
