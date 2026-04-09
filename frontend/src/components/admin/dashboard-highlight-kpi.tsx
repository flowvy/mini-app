import { useTranslation } from "react-i18next";
import { formatBwDiffSub } from "../../pages/admin/dashboard-rows.tsx";
import type { DashboardResponse } from "../../types/dashboard.ts";
import { DashboardKpiGrid } from "./dashboard-kpi-grid.tsx";
import type { KpiItem } from "./dashboard-kpi-grid.tsx";

interface DashboardHighlightKpiProps {
	data: DashboardResponse;
}

export function DashboardHighlightKpi({ data }: DashboardHighlightKpiProps) {
	const { t } = useTranslation();
	const rw = data.remnawaveStats;
	const bw = data.remnawaveBandwidth;

	const items: KpiItem[] = [];

	if (rw) {
		items.push({
			label: "admin.dashboard.kpi.users",
			value: rw.users.totalUsers,
			sub: t("admin.dashboard.kpi.onlineNow", { n: rw.onlineStats.onlineNow }),
			subColor: "var(--v2-text-positive)",
		});
	} else {
		items.push({
			label: "admin.dashboard.kpi.users",
			value: data.bot.users.totalUsers,
			sub: t("admin.dashboard.kpi.plusToday", { n: data.bot.users.newToday }),
			subColor: "var(--v2-text-positive)",
		});
	}

	if (bw) {
		const diff = formatBwDiffSub(bw.bandwidthLastTwoDays.difference);
		items.push({
			label: "admin.dashboard.kpi.today",
			value: bw.bandwidthLastTwoDays.current,
			sub: diff,
			subColor: bw.bandwidthLastTwoDays.difference.startsWith("-")
				? "var(--v2-text-negative)"
				: "var(--v2-text-positive)",
		});
	}

	if (rw) {
		items.push({
			label: "admin.dashboard.kpi.active",
			value: rw.users.statusCounts.ACTIVE,
			sub: t("admin.dashboard.vpn.active"),
			subColor: "var(--v2-text-positive)",
		});
	}

	items.push({
		label: "admin.dashboard.bot.active24h",
		value: data.bot.users.active24H,
		sub: t("admin.dashboard.kpi.todaySub"),
	});

	return <DashboardKpiGrid items={items} />;
}
