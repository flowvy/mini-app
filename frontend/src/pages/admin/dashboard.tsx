import { LayoutDashboard } from "lucide-react";
import type { FC } from "react";
import { useTranslation } from "react-i18next";
import styles from "../stub-page.module.css";

export const AdminDashboard: FC = () => {
	const { t } = useTranslation();
	return (
		<div className={styles.page}>
			<div className={styles.stubBody}>
				<LayoutDashboard size={48} className={styles.icon} />
				<span className={styles.title}>{t('admin.dashboard.comingSoon')}</span>
			</div>
		</div>
	);
};
