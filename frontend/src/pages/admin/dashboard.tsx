import { Bot, Globe } from "lucide-react";
import type { FC } from "react";
import { useTranslation } from "react-i18next";
import { DashboardDomainHeader } from "../../components/admin/dashboard-domain-header.tsx";
import { DashboardHighlightKpi } from "../../components/admin/dashboard-highlight-kpi.tsx";
import { useDashboard } from "../../hooks/use-dashboard.ts";
import { BotContent } from "./dashboard-bot.tsx";
import { VpnContent } from "./dashboard-vpn.tsx";
import styles from "./dashboard.module.css";

export const AdminDashboard: FC = () => {
	const { t } = useTranslation();
	const { data, isPending, error } = useDashboard();

	if (isPending) return <div className={styles.loading}>{t("admin.dashboard.loading")}</div>;
	if (error || !data) return <div className={styles.error}>{t("admin.dashboard.error")}</div>;

	return (
		<div className={styles.page}>
			<DashboardHighlightKpi data={data} />
			<DashboardDomainHeader icon={Globe} label={t("admin.dashboard.domain.vpn")} />
			<VpnContent data={data} t={t} />
			<DashboardDomainHeader icon={Bot} label={t("admin.dashboard.domain.bot")} />
			<BotContent data={data} t={t} />
		</div>
	);
};
