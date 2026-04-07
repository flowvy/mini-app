import { useTranslation } from "react-i18next";
import styles from "./dashboard-kpi-grid.module.css";

export interface KpiItem {
	label: string;
	value: string | number;
	sub?: string;
	subColor?: string;
}

export interface DashboardKpiGridProps {
	items: KpiItem[];
}

export function DashboardKpiGrid({ items }: DashboardKpiGridProps) {
	const { t } = useTranslation();
	return (
		<div className={styles.grid}>
			{items.map((item) => (
				<div key={item.label} className={styles.card}>
					<div className={styles.value}>{item.value}</div>
					<div className={styles.label}>{t(item.label)}</div>
					{item.sub && (
						<div
							className={styles.sub}
							style={item.subColor ? { color: item.subColor } : undefined}
						>
							{item.sub}
						</div>
					)}
				</div>
			))}
		</div>
	);
}
