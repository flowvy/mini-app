import { DashboardKpiGrid } from "../../components/admin/dashboard-kpi-grid.tsx";
import type { KpiItem } from "../../components/admin/dashboard-kpi-grid.tsx";
import {
	FormRowSeparator,
	FormSection,
	FormSectionCard,
} from "../../components/ui/form-section.tsx";
import { formatMemory, formatPositiveNumber, formatUptime } from "../../lib/format.ts";
import type { DashboardResponse } from "../../types/dashboard.ts";
import { Row } from "./dashboard-rows.tsx";
import styles from "./dashboard.module.css";

export function FlowvyContent({
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
		<div className={styles.sectionStack}>
			<DashboardKpiGrid items={kpis} />

			<FormSection title={t("admin.dashboard.flowvy.users")}>
				<FormSectionCard>
					<Row label={t("admin.dashboard.flowvy.total")} value={users.totalUsers} />
					<FormRowSeparator />
					<Row
						label={t("admin.dashboard.flowvy.registeredToday")}
						value={formatPositiveNumber(users.newToday)}
						accent="var(--v2-text-positive)"
					/>
					<FormRowSeparator />
					<Row
						label={t("admin.dashboard.flowvy.registeredWeek")}
						value={formatPositiveNumber(users.newThisWeek)}
					/>
				</FormSectionCard>
			</FormSection>

			<FormSection title={t("admin.dashboard.flowvy.activity")}>
				<FormSectionCard>
					<Row label={t("admin.dashboard.flowvy.active1h")} value={users.active1H} />
					<FormRowSeparator />
					<Row label={t("admin.dashboard.flowvy.active24h")} value={users.active24H} />
				</FormSectionCard>
			</FormSection>

			<FormSection title={t("admin.dashboard.flowvy.requests")}>
				<FormSectionCard>
					<Row
						label={t("admin.dashboard.flowvy.totalRequests")}
						value={requests.totalRequests.toLocaleString()}
					/>
					<FormRowSeparator />
					<Row
						label={t("admin.dashboard.flowvy.todayRequests")}
						value={requests.todayRequests.toLocaleString()}
					/>
				</FormSectionCard>
			</FormSection>

			<FormSection title={t("admin.dashboard.flowvy.system")}>
				<FormSectionCard>
					<Row
						label={t("admin.dashboard.flowvy.cpu")}
						value={t("admin.dashboard.flowvy.cores", { n: system.cpuCores })}
					/>
					<FormRowSeparator />
					<Row
						label={t("admin.dashboard.flowvy.memory")}
						value={formatMemory(system.memoryUsed, system.memoryTotal)}
					/>
					<FormRowSeparator />
					<Row
						label={t("admin.dashboard.flowvy.uptimeLabel")}
						value={formatUptime(system.uptimeSeconds)}
					/>
					<FormRowSeparator />
					<Row label={t("admin.dashboard.flowvy.versionLabel")} value={system.version} />
				</FormSectionCard>
			</FormSection>
		</div>
	);
}
