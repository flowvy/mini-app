import { LayoutDashboard } from "lucide-react";
import type { FC } from "react";
import styles from "../stub-page.module.css";

export const AdminDashboard: FC = () => {
	return (
		<div className={styles.page}>
			<LayoutDashboard size={48} className={styles.icon} />
			<h1 className={styles.title}>Dashboard</h1>
		</div>
	);
};
