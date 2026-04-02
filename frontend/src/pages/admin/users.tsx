import { Users } from "lucide-react";
import type { FC } from "react";
import styles from "../stub-page.module.css";

export const AdminUsers: FC = () => {
	return (
		<div className={styles.page}>
			<Users size={48} className={styles.icon} />
			<h1 className={styles.title}>Users</h1>
		</div>
	);
};
