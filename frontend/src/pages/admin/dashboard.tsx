import { type FC, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { ErrorState } from "../../components/ui/error-state.tsx";
import { PageLoading } from "../../components/ui/page-loading.tsx";
import { SegmentedControl } from "../../components/ui/segmented-control.tsx";
import { useDashboard } from "../../hooks/use-dashboard.ts";
import { useSwipe } from "../../hooks/use-swipe.ts";
import { FlowvyContent } from "./dashboard-flowvy.tsx";
import { RemnawaveContent } from "./dashboard-remnawave.tsx";
import styles from "./dashboard.module.css";

export const AdminDashboard: FC = () => {
	const { t } = useTranslation();
	const { data, isPending, error, refetch } = useDashboard();
	const [tab, setTab] = useState<"remnawave" | "flowvy">("remnawave");
	const handleSwipeLeft = useCallback(() => setTab("flowvy"), []);
	const handleSwipeRight = useCallback(() => setTab("remnawave"), []);
	const swipe = useSwipe({ onSwipeLeft: handleSwipeLeft, onSwipeRight: handleSwipeRight });

	if (isPending) return <PageLoading />;
	if (error || !data) return <ErrorState onAction={refetch} />;

	const tabOptions = [
		{ key: "remnawave", label: t("admin.dashboard.tab.remnawave") },
		{ key: "flowvy", label: t("admin.dashboard.tab.flowvy") },
	];

	return (
		<div className={styles.page}>
			<SegmentedControl
				options={tabOptions}
				value={tab}
				onChange={(k) => setTab(k as "remnawave" | "flowvy")}
				ariaLabel={t("admin.dashboard.viewLabel")}
			/>
			<div
				key={tab}
				className={styles.tabContent}
				onTouchStart={swipe.onTouchStart}
				onTouchEnd={swipe.onTouchEnd}
			>
				{tab === "remnawave" ? (
					<RemnawaveContent data={data} t={t} />
				) : (
					<FlowvyContent data={data} t={t} />
				)}
			</div>
		</div>
	);
};
