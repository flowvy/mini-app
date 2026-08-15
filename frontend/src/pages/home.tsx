import type { FC } from "react";
import { useTranslation } from "react-i18next";
import { DetailSection } from "../components/home/detail-section.tsx";
import { HeroCard } from "../components/home/hero-card.tsx";
import { InviteCard, InviteCardSkeleton } from "../components/home/invite-card.tsx";
import { SponsorCard } from "../components/home/sponsor-card.tsx";
import { ErrorState } from "../components/ui/error-state.tsx";
import { Skeleton } from "../components/ui/skeleton.tsx";
import { useSubscription } from "../hooks/use-subscription.ts";
import { ApiError } from "../lib/api.ts";
import styles from "./home.module.css";

export const Home: FC = () => {
	const { subscription, isPending, error, refetch } = useSubscription();
	const { t } = useTranslation();

	if (isPending) {
		return (
			<div className={styles.page}>
				<div className={styles.skeletonHero}>
					<div className={styles.skeletonHeroTop}>
						<Skeleton width="40%" height={16} radius={4} />
						<Skeleton width={60} height={16} radius={4} />
					</div>
					<Skeleton width="100%" height={6} radius={3} />
					<div className={styles.skeletonStats}>
						<Skeleton height={32} />
						<Skeleton height={32} />
						<Skeleton height={32} />
					</div>
				</div>
				<InviteCardSkeleton />
				<div className={styles.skeletonSection}>
					<div className={styles.skeletonSectionTitle}>
						<Skeleton width="30%" height={10} radius={3} />
					</div>
					{Array.from({ length: 4 }, (_, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
						<div key={i} className={styles.skeletonRow}>
							<Skeleton width="35%" height={12} radius={4} />
							<Skeleton width="25%" height={12} radius={4} />
						</div>
					))}
				</div>
			</div>
		);
	}

	if (error && !(error instanceof ApiError && error.status === 404)) {
		return (
			<div className={styles.page}>
				<ErrorState onAction={refetch} />
				<SponsorCard />
				<InviteCard />
			</div>
		);
	}

	if (!subscription || (error instanceof ApiError && error.status === 404)) {
		return (
			<div className={styles.page}>
				<p className={styles.noSubscription}>{t("home.noSubscription")}</p>
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
