import { DashboardBandwidthRow } from "../../components/admin/dashboard-bandwidth-row.tsx";
import {
	FormRowSeparator,
	FormSectionCard,
	FormSectionHeader,
} from "../../components/ui/form-section.tsx";
import { formatMemory, formatUptime } from "../../lib/format.ts";
import type { DashboardResponse } from "../../types/dashboard.ts";
import { Row, StatusRow } from "./dashboard-rows.tsx";
import styles from "./dashboard.module.css";

export function VpnContent({
	data,
	t,
}: { data: DashboardResponse; t: (k: string, o?: Record<string, unknown>) => string }) {
	const rw = data.remnawaveStats;
	const bw = data.remnawaveBandwidth;

	if (!rw || !bw) return <div className={styles.noData}>{t("admin.dashboard.noData")}</div>;

	return (
		<div>
			<FormSectionHeader>{t("admin.dashboard.vpn.usersByStatus")}</FormSectionHeader>
			<FormSectionCard>
				<StatusRow
					label={t("admin.dashboard.vpn.active")}
					value={rw.users.statusCounts.ACTIVE}
					dot="var(--v2-text-positive)"
				/>
				<FormRowSeparator />
				<StatusRow
					label={t("admin.dashboard.vpn.disabled")}
					value={rw.users.statusCounts.DISABLED}
					dot="var(--v2-text-secondary)"
				/>
				<FormRowSeparator />
				<StatusRow
					label={t("admin.dashboard.vpn.limited")}
					value={rw.users.statusCounts.LIMITED}
					dot="var(--v2-text-warning)"
				/>
				<FormRowSeparator />
				<StatusRow
					label={t("admin.dashboard.vpn.expired")}
					value={rw.users.statusCounts.EXPIRED}
					dot="var(--v2-text-negative)"
				/>
			</FormSectionCard>

			<FormSectionHeader>{t("admin.dashboard.vpn.online")}</FormSectionHeader>
			<FormSectionCard>
				<Row
					label={t("admin.dashboard.vpn.now")}
					value={rw.onlineStats.onlineNow}
					accent="var(--v2-text-positive)"
				/>
				<FormRowSeparator />
				<Row label={t("admin.dashboard.vpn.last24h")} value={rw.onlineStats.lastDay} />
				<FormRowSeparator />
				<Row label={t("admin.dashboard.vpn.last7d")} value={rw.onlineStats.lastWeek} />
				<FormRowSeparator />
				<Row
					label={t("admin.dashboard.vpn.neverConnected")}
					value={rw.onlineStats.neverOnline}
					muted
				/>
			</FormSectionCard>

			<FormSectionHeader>{t("admin.dashboard.vpn.bandwidth")}</FormSectionHeader>
			<FormSectionCard>
				<DashboardBandwidthRow label="admin.dashboard.vpn.bwToday" {...bw.bandwidthLastTwoDays} />
				<FormRowSeparator />
				<DashboardBandwidthRow label="admin.dashboard.vpn.bw7d" {...bw.bandwidthLastSevenDays} />
				<FormRowSeparator />
				<DashboardBandwidthRow label="admin.dashboard.vpn.bw30d" {...bw.bandwidthLast30Days} />
				<FormRowSeparator />
				<DashboardBandwidthRow label="admin.dashboard.vpn.bwMonth" {...bw.bandwidthCalendarMonth} />
				<FormRowSeparator />
				<DashboardBandwidthRow label="admin.dashboard.vpn.bwYear" {...bw.bandwidthCurrentYear} />
			</FormSectionCard>

			<FormSectionHeader>{t("admin.dashboard.vpn.system")}</FormSectionHeader>
			<FormSectionCard>
				<Row
					label={t("admin.dashboard.vpn.cpu")}
					value={t("admin.dashboard.vpn.cores", { n: rw.cpu.cores })}
				/>
				<FormRowSeparator />
				<Row
					label={t("admin.dashboard.vpn.memory")}
					value={formatMemory(rw.memory.used, rw.memory.total)}
				/>
				<FormRowSeparator />
				<Row label={t("admin.dashboard.vpn.uptimeLabel")} value={formatUptime(rw.uptime)} />
			</FormSectionCard>
		</div>
	);
}
