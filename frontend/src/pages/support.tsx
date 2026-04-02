import { HelpCircle } from "lucide-react";
import type { FC } from "react";
import styles from "./stub-page.module.css";

export const Support: FC = () => {
	return (
		<div className={styles.page}>
			<HelpCircle size={48} className={styles.icon} />
			<h1 className={styles.title}>Support</h1>
		</div>
	);
};
