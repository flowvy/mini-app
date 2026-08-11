import { HelpCircle } from "lucide-react";
import type { FC } from "react";
import { useTranslation } from "react-i18next";
import styles from "./support.module.css";

export const Support: FC = () => {
	const { t } = useTranslation();
	return (
		<div className={styles.page}>
			<section className={styles.card} aria-labelledby="support-title">
				<HelpCircle size={36} className={styles.icon} aria-hidden="true" />
				<div className={styles.copy}>
					<h1 id="support-title" className={styles.title}>
						{t("support.title")}
					</h1>
					<p className={styles.description}>{t("support.comingSoon")}</p>
				</div>
			</section>
		</div>
	);
};
