import { AlertTriangle, CheckCircle, Wrench } from "lucide-react";
import type { FC } from "react";
import { useTranslation } from "react-i18next";
import type { PulseData } from "../../types/pulse.ts";
import styles from "./status-banner.module.css";

interface StatusBannerProps {
	status: PulseData["overallStatus"];
}

const CONFIG = {
	operational: {
		icon: CheckCircle,
		label: "pulse.banner.operational",
		className: "positive",
	},
	partial: {
		icon: AlertTriangle,
		label: "pulse.banner.partial",
		className: "negative",
	},
	maintenance: {
		icon: Wrench,
		label: "pulse.banner.maintenance",
		className: "info",
	},
	down: {
		icon: AlertTriangle,
		label: "pulse.banner.down",
		className: "negative",
	},
} as const;

export const StatusBanner: FC<StatusBannerProps> = ({ status }) => {
	const { t } = useTranslation();
	const config = CONFIG[status];
	const Icon = config.icon;

	return (
		<div className={`${styles.banner} ${styles[config.className]}`}>
			<Icon size={18} />
			<span className={styles.label}>{t(config.label)}</span>
		</div>
	);
};
