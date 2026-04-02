import { Activity } from "lucide-react";
import type { FC } from "react";
import styles from "./stub-page.module.css";

export const Pulse: FC = () => {
	return (
		<div className={styles.page}>
			<Activity size={48} className={styles.icon} />
			<h1 className={styles.title}>Pulse</h1>
		</div>
	);
};
