import { Megaphone } from "lucide-react";
import type { FC } from "react";
import styles from "../stub-page.module.css";

export const AdminBroadcast: FC = () => {
	return (
		<div className={styles.page}>
			<Megaphone size={48} className={styles.icon} />
			<h1 className={styles.title}>Broadcast</h1>
		</div>
	);
};
