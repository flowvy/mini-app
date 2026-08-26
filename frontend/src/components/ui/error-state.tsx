import { AlertTriangle } from "lucide-react";
import type { FC } from "react";
import { useTranslation } from "react-i18next";
import { ActionBtn } from "./action-btn.tsx";
import styles from "./error-state.module.css";

type ErrorStateVariant = "load" | "auth" | "forbidden" | "notFound";

const COPY_KEYS: Record<ErrorStateVariant, { title: string; description: string; action: string }> =
	{
		load: {
			title: "common.errorState.load.title",
			description: "common.errorState.load.description",
			action: "common.errorState.load.action",
		},
		auth: {
			title: "common.errorState.auth.title",
			description: "common.errorState.auth.description",
			action: "common.errorState.auth.action",
		},
		forbidden: {
			title: "common.errorState.forbidden.title",
			description: "common.errorState.forbidden.description",
			action: "common.errorState.forbidden.action",
		},
		notFound: {
			title: "common.errorState.notFound.title",
			description: "common.errorState.notFound.description",
			action: "common.errorState.notFound.action",
		},
	};

interface ErrorStateProps {
	variant?: ErrorStateVariant;
	onAction?: () => unknown;
	title?: string;
	description?: string;
	actionLabel?: string;
}

export const ErrorState: FC<ErrorStateProps> = ({
	variant = "load",
	onAction,
	title,
	description,
	actionLabel,
}) => {
	const { t } = useTranslation();
	const copy = COPY_KEYS[variant];

	return (
		<section className={styles.root} role="alert" aria-live="polite">
			<AlertTriangle size={32} className={styles.icon} aria-hidden="true" />
			<h1 className={styles.title}>{title ?? t(copy.title)}</h1>
			<p className={styles.description}>{description ?? t(copy.description)}</p>
			{onAction && (
				<ActionBtn variant="action" size="md" onClick={() => onAction()}>
					{actionLabel ?? t(copy.action)}
				</ActionBtn>
			)}
		</section>
	);
};
