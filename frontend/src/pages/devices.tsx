import { Smartphone } from "lucide-react";
import type { FC } from "react";
import styles from "./stub-page.module.css";

export const Devices: FC = () => {
	return (
		<div className={styles.page}>
			<Smartphone size={48} className={styles.icon} />
			<h1 className={styles.title}>Devices</h1>
		</div>
	);
};
