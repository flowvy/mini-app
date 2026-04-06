import { Megaphone } from "lucide-react";
import type { FC } from "react";
import styles from "../stub-page.module.css";

export const AdminBroadcast: FC = () => {
	return (
		<div className={styles.page}>
			<div className={styles.stubBody}>
				<Megaphone size={48} className={styles.icon} />
				<span className={styles.title}>Coming soon</span>
			</div>
		</div>
	);
};
