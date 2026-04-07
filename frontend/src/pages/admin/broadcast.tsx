import { Megaphone } from "lucide-react";
import type { FC } from "react";
import { useTranslation } from "react-i18next";
import styles from "../stub-page.module.css";

export const AdminBroadcast: FC = () => {
	const { t } = useTranslation();
	return (
		<div className={styles.page}>
			<div className={styles.stubBody}>
				<Megaphone size={48} className={styles.icon} />
				<span className={styles.title}>{t('admin.broadcast.comingSoon')}</span>
			</div>
		</div>
	);
};
