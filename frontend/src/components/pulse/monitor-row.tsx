/**
 * Single monitor row — status dot, name, uptime %, heartbeat bar.
 */
import type { FC } from "react";
import { useTranslation } from "react-i18next";
import type { PulseMonitor } from "../../types/pulse.ts";
import { HeartbeatBar } from "./heartbeat-bar.tsx";
import styles from "./monitor-row.module.css";

interface MonitorRowProps {
	monitor: PulseMonitor;
}

const STATUS_CLASS: Record<string, string> = {
	up: "dotUp",
	down: "dotDown",
	pending: "dotPending",
	maintenance: "dotMaintenance",
};

export const MonitorRow: FC<MonitorRowProps> = ({ monitor }) => {
	const { t } = useTranslation();
	const uptimePercent =
		monitor.uptime24H === 1 ? "100%" : `${(monitor.uptime24H * 100).toFixed(1)}%`;

	return (
		<div className={styles.row}>
			<div className={styles.header}>
				<div className={styles.left}>
					<span
						className={`${styles.dot} ${styles[STATUS_CLASS[monitor.status] ?? "dotPending"]}`}
					/>
					<span className={styles.name}>{monitor.name}</span>
				</div>
				<span className={styles.uptime}>{uptimePercent}</span>
			</div>
			<HeartbeatBar heartbeats={monitor.heartbeats} />
			<div className={styles.timeline}>
				<span>{t("pulse.timeline.past")}</span>
				<span>{t("pulse.timeline.now")}</span>
			</div>
		</div>
	);
};
