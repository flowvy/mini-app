import { Settings } from "lucide-react";
import type { FC } from "react";
import styles from "../stub-page.module.css";

export const AdminSettings: FC = () => {
	return (
		<div className={styles.page}>
			<Settings size={48} className={styles.icon} />
			<h1 className={styles.title}>Settings</h1>
		</div>
	);
};
