import { DashboardBandwidthRow } from "../../components/admin/dashboard-bandwidth-row.tsx";
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
		<>
			<div className={styles.sectionBody}>
				<div className={styles.divider}>{t("admin.dashboard.vpn.usersByStatus")}</div>
				<StatusRow
					label={t("admin.dashboard.vpn.active")}
					value={rw.users.statusCounts.ACTIVE}
					dot="var(--v2-text-positive)"
				/>
				<StatusRow
					label={t("admin.dashboard.vpn.disabled")}
					value={rw.users.statusCounts.DISABLED}
					dot="var(--v2-text-secondary)"
				/>
				<StatusRow
					label={t("admin.dashboard.vpn.limited")}
					value={rw.users.statusCounts.LIMITED}
					dot="var(--v2-text-warning)"
				/>
				<StatusRow
					label={t("admin.dashboard.vpn.expired")}
					value={rw.users.statusCounts.EXPIRED}
					dot="var(--v2-text-negative)"
				/>

				<div className={styles.divider}>{t("admin.dashboard.vpn.online")}</div>
				<Row
					label={t("admin.dashboard.vpn.now")}
					value={rw.onlineStats.onlineNow}
					accent="var(--v2-text-positive)"
				/>
				<Row label={t("admin.dashboard.vpn.last24h")} value={rw.onlineStats.lastDay} />
				<Row label={t("admin.dashboard.vpn.last7d")} value={rw.onlineStats.lastWeek} />
				<Row
					label={t("admin.dashboard.vpn.neverConnected")}
					value={rw.onlineStats.neverOnline}
					muted
				/>
			</div>

			<div className={styles.sectionBody}>
				<div className={styles.divider}>{t("admin.dashboard.vpn.bandwidth")}</div>
				<DashboardBandwidthRow label="admin.dashboard.vpn.bwToday" {...bw.bandwidthLastTwoDays} />
				<DashboardBandwidthRow label="admin.dashboard.vpn.bw7d" {...bw.bandwidthLastSevenDays} />
				<DashboardBandwidthRow label="admin.dashboard.vpn.bw30d" {...bw.bandwidthLast30Days} />
				<DashboardBandwidthRow label="admin.dashboard.vpn.bwMonth" {...bw.bandwidthCalendarMonth} />
				<DashboardBandwidthRow label="admin.dashboard.vpn.bwYear" {...bw.bandwidthCurrentYear} />
			</div>

			<div className={styles.sectionBody}>
				<div className={styles.divider}>{t("admin.dashboard.vpn.system")}</div>
				<Row
					label={t("admin.dashboard.vpn.cpu")}
					value={t("admin.dashboard.vpn.cores", { n: rw.cpu.cores })}
				/>
				<Row
					label={t("admin.dashboard.vpn.memory")}
					value={formatMemory(rw.memory.used, rw.memory.total)}
				/>
				<Row label={t("admin.dashboard.vpn.uptimeLabel")} value={formatUptime(rw.uptime)} />
			</div>
		</>
	);
}
