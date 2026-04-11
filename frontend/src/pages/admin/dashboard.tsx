import { type FC, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { PageLoading } from "../../components/ui/page-loading.tsx";
import { SegmentedControl } from "../../components/ui/segmented-control.tsx";
import { useDashboard } from "../../hooks/use-dashboard.ts";
import { useSwipe } from "../../hooks/use-swipe.ts";
import { BotContent } from "./dashboard-bot.tsx";
import { VpnContent } from "./dashboard-vpn.tsx";
import styles from "./dashboard.module.css";

export const AdminDashboard: FC = () => {
	const { t } = useTranslation();
	const { data, isPending, error } = useDashboard();
	const [tab, setTab] = useState<"vpn" | "bot">("vpn");
	const handleSwipeLeft = useCallback(() => setTab("bot"), []);
	const handleSwipeRight = useCallback(() => setTab("vpn"), []);
	const swipe = useSwipe({ onSwipeLeft: handleSwipeLeft, onSwipeRight: handleSwipeRight });

	if (isPending) return <PageLoading />;
	if (error || !data) return <div className={styles.error}>{t("admin.dashboard.error")}</div>;

	const tabOptions = [
		{ key: "vpn", label: t("admin.dashboard.tab.vpn") },
		{ key: "bot", label: t("admin.dashboard.tab.bot") },
	];

	return (
		<div className={styles.page}>
			<SegmentedControl
				options={tabOptions}
				value={tab}
				onChange={(k) => setTab(k as "vpn" | "bot")}
			/>
			<div onTouchStart={swipe.onTouchStart} onTouchEnd={swipe.onTouchEnd}>
				{tab === "vpn" ? <VpnContent data={data} t={t} /> : <BotContent data={data} t={t} />}
			</div>
		</div>
	);
};
