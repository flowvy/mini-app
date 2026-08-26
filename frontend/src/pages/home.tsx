import type { FC } from "react";
import { DetailSection } from "../components/home/detail-section.tsx";
import { HeroCard } from "../components/home/hero-card.tsx";
import { InviteCard } from "../components/home/invite-card.tsx";
import { SponsorCard } from "../components/home/sponsor-card.tsx";
import { ErrorState } from "../components/ui/error-state.tsx";
import { PageLoading } from "../components/ui/page-loading.tsx";
import { useSubscription } from "../hooks/use-subscription.ts";
import styles from "./home.module.css";

export const Home: FC = () => {
	const { subscription, isPending, error, refetch } = useSubscription();

	if (isPending) {
		return <PageLoading />;
	}

	if (error) {
		return (
			<div className={styles.page}>
				<ErrorState onAction={refetch} />
				<SponsorCard />
				<InviteCard />
			</div>
		);
	}

	if (!subscription) {
		return (
			<div className={styles.page}>
				<HeroCard subscription={null} />
				<SponsorCard />
				<InviteCard />
			</div>
		);
	}

	return (
		<div className={styles.page}>
			<HeroCard subscription={subscription} />
			<SponsorCard />
			<InviteCard />
			<DetailSection subscription={subscription} />
		</div>
	);
};
