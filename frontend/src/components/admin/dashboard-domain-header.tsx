import type { LucideIcon } from "lucide-react";
import styles from "./dashboard-domain-header.module.css";

interface DashboardDomainHeaderProps {
	icon: LucideIcon;
	label: string;
}

export function DashboardDomainHeader({ icon: Icon, label }: DashboardDomainHeaderProps) {
	return (
		<div className={styles.root}>
			<Icon size={14} className={styles.icon} />
			<span className={styles.label}>{label}</span>
			<div className={styles.line} />
		</div>
	);
}
