import { LayoutDashboard } from "lucide-react";
import type { FC } from "react";
import styles from "../stub-page.module.css";

export const AdminDashboard: FC = () => {
	return (
		<div className={styles.page}>
			<div className={styles.stubBody}>
				<LayoutDashboard size={48} className={styles.icon} />
				<span className={styles.title}>Coming soon</span>
			</div>
		</div>
	);
};
