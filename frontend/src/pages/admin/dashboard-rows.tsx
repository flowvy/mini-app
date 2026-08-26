import { formatTrend } from "../../lib/format.ts";
import styles from "./dashboard.module.css";

export function Row({
	label,
	value,
	muted,
	accent,
}: {
	label: string;
	value: string | number;
	muted?: boolean;
	accent?: string;
}) {
	return (
		<div className={styles.row}>
			<span className={styles.rowLabel}>{label}</span>
			<span
				className={`${styles.rowValue} ${styles.mono} ${muted ? styles.muted : ""}`}
				style={accent ? { color: accent } : undefined}
			>
				{value}
			</span>
		</div>
	);
}

export function StatusRow({ label, value, dot }: { label: string; value: number; dot: string }) {
	return (
		<div className={styles.row}>
			<span className={styles.rowLabel}>
				<span className={styles.dot} style={{ background: dot, boxShadow: `0 0 6px ${dot}` }} />
				{label}
			</span>
			<span className={`${styles.rowValue} ${styles.mono}`}>{value}</span>
		</div>
	);
}

export function formatBwDiffSub(diff: string): string {
	return formatTrend(diff);
}
