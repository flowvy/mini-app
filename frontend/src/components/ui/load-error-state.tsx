import { AlertTriangle } from "lucide-react";
import type { FC } from "react";
import { useTranslation } from "react-i18next";
import { ActionBtn } from "./action-btn.tsx";
import styles from "./load-error-state.module.css";

interface LoadErrorStateProps {
	onRetry?: () => unknown;
}

export const LoadErrorState: FC<LoadErrorStateProps> = ({ onRetry }) => {
	const { t } = useTranslation();

	return (
		<section className={styles.root} role="alert" aria-live="polite">
			<AlertTriangle size={32} className={styles.icon} aria-hidden="true" />
			<h1 className={styles.title}>{t("common.loadError.title")}</h1>
			<p className={styles.description}>{t("common.loadError.description")}</p>
			{onRetry && (
				<ActionBtn variant="action" size="md" onClick={() => onRetry()}>
					{t("common.loadError.retry")}
				</ActionBtn>
			)}
		</section>
	);
};
