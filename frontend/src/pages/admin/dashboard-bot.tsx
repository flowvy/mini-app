import { DashboardKpiGrid } from "../../components/admin/dashboard-kpi-grid.tsx";
import type { KpiItem } from "../../components/admin/dashboard-kpi-grid.tsx";
import { formatMemory, formatUptime } from "../../lib/format.ts";
import type { DashboardResponse } from "../../types/dashboard.ts";
import { Row } from "./dashboard-rows.tsx";
import styles from "./dashboard.module.css";

export function BotContent({
	data,
	t,
}: { data: DashboardResponse; t: (k: string, o?: Record<string, unknown>) => string }) {
	const { system, users, requests } = data.bot;

	const kpis: KpiItem[] = [
		{
			label: "admin.dashboard.kpi.users",
			value: users.totalUsers,
			sub: t("admin.dashboard.kpi.plusToday", { n: users.newToday }),
			subColor: "var(--v2-text-positive)",
		},
		{
			label: "admin.dashboard.kpi.active",
			value: users.active24H,
			sub: t("admin.dashboard.kpi.todaySub"),
		},
		{
			label: "admin.dashboard.kpi.requests",
			value: requests.todayRequests.toLocaleString(),
			sub: t("admin.dashboard.kpi.todaySub"),
		},
		{
			label: "admin.dashboard.kpi.uptime",
			value: formatUptime(system.uptimeSeconds),
			sub: t("admin.dashboard.kpi.version", { v: system.version }),
		},
	];

	return (
		<>
			<DashboardKpiGrid items={kpis} />

			<div className={styles.sectionBody}>
				<div className={styles.divider}>{t("admin.dashboard.bot.users")}</div>
				<Row label={t("admin.dashboard.bot.total")} value={users.totalUsers} />
				<Row
					label={t("admin.dashboard.bot.registeredToday")}
					value={`+${users.newToday}`}
					accent="var(--v2-text-positive)"
				/>
				<Row label={t("admin.dashboard.bot.registeredWeek")} value={`+${users.newThisWeek}`} />

				<div className={styles.divider}>{t("admin.dashboard.bot.activity")}</div>
				<Row label={t("admin.dashboard.bot.active1h")} value={users.active1H} />
				<Row label={t("admin.dashboard.bot.active24h")} value={users.active24H} />
			</div>

			<div className={styles.sectionBody}>
				<div className={styles.divider}>{t("admin.dashboard.bot.requests")}</div>
				<Row
					label={t("admin.dashboard.bot.totalRequests")}
					value={requests.totalRequests.toLocaleString()}
				/>
				<Row
					label={t("admin.dashboard.bot.todayRequests")}
					value={requests.todayRequests.toLocaleString()}
				/>
			</div>

			<div className={styles.sectionBody}>
				<div className={styles.divider}>{t("admin.dashboard.bot.system")}</div>
				<Row
					label={t("admin.dashboard.bot.cpu")}
					value={t("admin.dashboard.bot.cores", { n: system.cpuCores })}
				/>
				<Row
					label={t("admin.dashboard.bot.memory")}
					value={formatMemory(system.memoryUsed, system.memoryTotal)}
				/>
				<Row
					label={t("admin.dashboard.bot.uptimeLabel")}
					value={formatUptime(system.uptimeSeconds)}
				/>
				<Row label={t("admin.dashboard.bot.versionLabel")} value={system.version} />
			</div>
		</>
	);
}
