import { useTranslation } from "react-i18next";
import styles from "./dashboard-bandwidth-row.module.css";

export interface DashboardBandwidthRowProps {
	label: string;
	current: string;
	previous: string;
	difference: string;
}

function parseDiff(s: string): { value: string; positive: boolean } {
	if (!s) return { value: s, positive: true };
	const positive = !s.startsWith("-");
	return { value: s.replace("-", ""), positive };
}

export function DashboardBandwidthRow({
	label,
	current,
	previous,
	difference,
}: DashboardBandwidthRowProps) {
	const { t } = useTranslation();
	const diff = parseDiff(difference);

	return (
		<div className={styles.row}>
			<div className={styles.left}>
				<span className={styles.label}>{t(label)}</span>
				<span className={styles.prev}>{t("admin.dashboard.vpn.prev", { v: previous })}</span>
			</div>
			<div className={styles.right}>
				<span className={styles.current}>{current}</span>
				<span className={diff.positive ? styles.diffUp : styles.diffDown}>
					{diff.positive ? "\u2191" : "\u2193"} {diff.value}
				</span>
			</div>
		</div>
	);
}
