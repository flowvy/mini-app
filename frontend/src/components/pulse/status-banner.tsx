/**
 * Overall system status banner — shows one of four states.
 */
import { AlertTriangle, CheckCircle, Wrench } from "lucide-react";
import type { FC } from "react";
import type { PulseData } from "../../types/pulse.ts";
import styles from "./status-banner.module.css";

interface StatusBannerProps {
	status: PulseData["overallStatus"];
}

const CONFIG = {
	operational: {
		icon: CheckCircle,
		label: "All systems operational",
		className: "positive",
	},
	partial: {
		icon: AlertTriangle,
		label: "Partial system outage",
		className: "negative",
	},
	maintenance: {
		icon: Wrench,
		label: "Scheduled maintenance",
		className: "info",
	},
	down: {
		icon: AlertTriangle,
		label: "Major outage",
		className: "negative",
	},
} as const;

export const StatusBanner: FC<StatusBannerProps> = ({ status }) => {
	const config = CONFIG[status];
	const Icon = config.icon;

	return (
		<div className={`${styles.banner} ${styles[config.className]}`}>
			<Icon size={18} />
			<span className={styles.label}>{config.label}</span>
		</div>
	);
};
