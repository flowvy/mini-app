import { HelpCircle } from "lucide-react";
import type { FC } from "react";
import { useTranslation } from "react-i18next";
import styles from "./stub-page.module.css";

export const Support: FC = () => {
	const { t } = useTranslation();
	return (
		<div className={styles.page}>
			<div className={styles.stubBody}>
				<HelpCircle size={48} className={styles.icon} />
				<span className={styles.title}>{t('common.comingSoon')}</span>
			</div>
		</div>
	);
};
