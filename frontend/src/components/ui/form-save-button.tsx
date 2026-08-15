import type { FC } from "react";
import { useTranslation } from "react-i18next";
import styles from "./form-save-button.module.css";
import { SpinnerIcon } from "./spinner-icon.tsx";

interface FormSaveButtonProps {
	dirty: boolean;
	loading?: boolean;
	disabled?: boolean;
	label?: string;
	onSave: () => void;
}

export const FormSaveButton: FC<FormSaveButtonProps> = ({
	dirty,
	loading,
	disabled = false,
	label,
	onSave,
}) => {
	const { t } = useTranslation();
	const active = dirty && !disabled;
	const buttonLabel = label ?? t("common.save");

	return (
		<div className={styles.wrapper}>
			<button
				type="button"
				className={styles.btn}
				data-active={active ? "" : undefined}
				disabled={!active || loading}
				aria-busy={loading || undefined}
				onClick={onSave}
			>
				{loading ? (
					<>
						<span className={styles.content} data-loading-hidden="">
							{buttonLabel}
						</span>
						<span className={styles.loadingIndicator}>
							<SpinnerIcon size={14} />
						</span>
					</>
				) : (
					buttonLabel
				)}
			</button>
		</div>
	);
};
