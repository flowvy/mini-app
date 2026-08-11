import { useTranslation } from "react-i18next";
import { formatTrend } from "../../lib/format.ts";
import styles from "./dashboard-bandwidth-row.module.css";

export interface DashboardBandwidthRowProps {
	label: string;
	current: string;
	previous: string;
	difference: string;
}

export function DashboardBandwidthRow({
	label,
	current,
	previous,
	difference,
}: DashboardBandwidthRowProps) {
	const { t } = useTranslation();
	const positive = !difference.startsWith("-");

	return (
		<div className={styles.row}>
			<div className={styles.left}>
				<span className={styles.label}>{t(label)}</span>
				<span className={styles.prev}>{t("admin.dashboard.remnawave.prev", { v: previous })}</span>
			</div>
			<div className={styles.right}>
				<span className={styles.current}>{current}</span>
				<span className={positive ? styles.diffUp : styles.diffDown}>
					{formatTrend(difference)}
				</span>
			</div>
		</div>
	);
}
