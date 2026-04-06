import { Users } from "lucide-react";
import type { FC } from "react";
import styles from "../stub-page.module.css";

export const AdminUsers: FC = () => {
	return (
		<div className={styles.page}>
			<div className={styles.stubBody}>
				<Users size={48} className={styles.icon} />
				<span className={styles.title}>Coming soon</span>
			</div>
		</div>
	);
};
