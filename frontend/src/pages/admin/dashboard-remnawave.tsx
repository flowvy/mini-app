import { DashboardBandwidthRow } from "../../components/admin/dashboard-bandwidth-row.tsx";
import { DashboardKpiGrid } from "../../components/admin/dashboard-kpi-grid.tsx";
import type { KpiItem } from "../../components/admin/dashboard-kpi-grid.tsx";
import {
	FormRowSeparator,
	FormSectionCard,
	FormSectionHeader,
} from "../../components/ui/form-section.tsx";
import { formatMemory, formatTraffic, formatUptime } from "../../lib/format.ts";
import type { DashboardResponse } from "../../types/dashboard.ts";
import { Row, StatusRow, formatBwDiffSub } from "./dashboard-rows.tsx";
import styles from "./dashboard.module.css";

export function RemnawaveContent({
	data,
	t,
}: { data: DashboardResponse; t: (k: string, o?: Record<string, unknown>) => string }) {
	const rw = data.remnawaveStats;
	const bw = data.remnawaveBandwidth;

	if (!rw || !bw) return <div className={styles.noData}>{t("admin.dashboard.noData")}</div>;

	const diff = formatBwDiffSub(bw.bandwidthLastTwoDays.difference);
	const kpis: KpiItem[] = [
		{
			label: "admin.dashboard.kpi.users",
			value: rw.users.totalUsers,
			sub: t("admin.dashboard.kpi.onlineNow", { n: rw.onlineStats.onlineNow }),
			subColor: "var(--v2-text-positive)",
		},
		{
			label: "admin.dashboard.kpi.nodes",
			value: rw.nodes.totalOnline,
			sub: t("admin.dashboard.kpi.allNodes"),
			subColor: "var(--v2-text-positive)",
		},
		{
			label: "admin.dashboard.kpi.today",
			value: bw.bandwidthLastTwoDays.current,
			sub: diff,
			subColor: bw.bandwidthLastTwoDays.difference.startsWith("-")
				? "var(--v2-text-negative)"
				: "var(--v2-text-positive)",
		},
		{
			label: "admin.dashboard.kpi.lifetime",
			value: formatTraffic(Number(rw.nodes.totalBytesLifetime)),
			sub: t("admin.dashboard.kpi.todaySub"),
		},
	];

	return (
		<div>
			<DashboardKpiGrid items={kpis} />

			<FormSectionHeader>{t("admin.dashboard.remnawave.usersByStatus")}</FormSectionHeader>
			<FormSectionCard>
				<StatusRow
					label={t("admin.userStatus.active")}
					value={rw.users.statusCounts.ACTIVE}
					dot="var(--v2-text-positive)"
				/>
				<FormRowSeparator />
				<StatusRow
					label={t("admin.userStatus.disabled")}
					value={rw.users.statusCounts.DISABLED}
					dot="var(--v2-text-secondary)"
				/>
				<FormRowSeparator />
				<StatusRow
					label={t("admin.userStatus.limited")}
					value={rw.users.statusCounts.LIMITED}
					dot="var(--v2-text-warning)"
				/>
				<FormRowSeparator />
				<StatusRow
					label={t("admin.userStatus.expired")}
					value={rw.users.statusCounts.EXPIRED}
					dot="var(--v2-text-negative)"
				/>
				{rw.users.statusCounts.UNKNOWN > 0 && (
					<>
						<FormRowSeparator />
						<StatusRow
							label={t("admin.userStatus.unknown")}
							value={rw.users.statusCounts.UNKNOWN}
							dot="var(--v2-text-secondary)"
						/>
					</>
				)}
			</FormSectionCard>

			<FormSectionHeader>{t("admin.dashboard.remnawave.online")}</FormSectionHeader>
			<FormSectionCard>
				<Row
					label={t("admin.dashboard.remnawave.now")}
					value={rw.onlineStats.onlineNow}
					accent="var(--v2-text-positive)"
				/>
				<FormRowSeparator />
				<Row label={t("admin.dashboard.remnawave.last24h")} value={rw.onlineStats.lastDay} />
				<FormRowSeparator />
				<Row label={t("admin.dashboard.remnawave.last7d")} value={rw.onlineStats.lastWeek} />
				<FormRowSeparator />
				<Row
					label={t("admin.dashboard.remnawave.neverConnected")}
					value={rw.onlineStats.neverOnline}
					muted
				/>
			</FormSectionCard>

			<FormSectionHeader>{t("admin.dashboard.remnawave.bandwidth")}</FormSectionHeader>
			<FormSectionCard>
				<DashboardBandwidthRow
					label="admin.dashboard.remnawave.bwToday"
					{...bw.bandwidthLastTwoDays}
				/>
				<FormRowSeparator />
				<DashboardBandwidthRow
					label="admin.dashboard.remnawave.bw7d"
					{...bw.bandwidthLastSevenDays}
				/>
				<FormRowSeparator />
				<DashboardBandwidthRow
					label="admin.dashboard.remnawave.bw30d"
					{...bw.bandwidthLast30Days}
				/>
				<FormRowSeparator />
				<DashboardBandwidthRow
					label="admin.dashboard.remnawave.bwMonth"
					{...bw.bandwidthCalendarMonth}
				/>
				<FormRowSeparator />
				<DashboardBandwidthRow
					label="admin.dashboard.remnawave.bwYear"
					{...bw.bandwidthCurrentYear}
				/>
			</FormSectionCard>

			<FormSectionHeader>{t("admin.dashboard.remnawave.system")}</FormSectionHeader>
			<FormSectionCard>
				<Row
					label={t("admin.dashboard.remnawave.cpu")}
					value={t("admin.dashboard.remnawave.cores", { n: rw.cpu.cores })}
				/>
				<FormRowSeparator />
				<Row
					label={t("admin.dashboard.remnawave.memory")}
					value={formatMemory(rw.memory.used, rw.memory.total)}
				/>
				<FormRowSeparator />
				<Row label={t("admin.dashboard.remnawave.uptimeLabel")} value={formatUptime(rw.uptime)} />
			</FormSectionCard>
		</div>
	);
}
