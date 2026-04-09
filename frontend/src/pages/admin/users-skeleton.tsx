import type { FC } from "react";
import { Skeleton } from "../../components/ui/skeleton.tsx";
import sk from "./users-skeleton.module.css";
import styles from "./users.module.css";

export const UsersListSkeleton: FC = () => (
	<div className={styles.page}>
		<div className={styles.header}>
			<Skeleton width={50} height={20} radius={6} />
			<Skeleton width={28} height={20} radius={4} />
		</div>
		<div className={styles.searchWrap}>
			<Skeleton width="100%" height={36} />
		</div>
		<div className={styles.list}>
			{Array.from({ length: 7 }, (_, i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton list
				<div key={i} className={styles.card}>
					<div className={sk.skeletonRow}>
						<Skeleton width="35%" height={13} radius={4} />
						<Skeleton width={42} height={16} radius={4} />
						<div className={sk.skeletonRight}>
							<Skeleton width={32} height={3} radius={2} />
							<Skeleton width={14} height={14} radius={4} />
						</div>
					</div>
					<div className={sk.skeletonRow2}>
						<Skeleton width="55%" height={11} radius={4} />
						<Skeleton width={40} height={11} radius={4} />
					</div>
				</div>
			))}
		</div>
	</div>
);
