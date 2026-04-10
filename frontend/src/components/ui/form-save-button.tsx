import type { FC } from "react";
import { useTranslation } from "react-i18next";
import styles from "./form-save-button.module.css";
import { SpinnerIcon } from "./spinner-icon.tsx";

interface FormSaveButtonProps {
	dirty: boolean;
	loading?: boolean;
	onSave: () => void;
}

export const FormSaveButton: FC<FormSaveButtonProps> = ({ dirty, loading, onSave }) => {
	const { t } = useTranslation();

	return (
		<div className={styles.wrapper}>
			<button type="button" className={styles.btn} disabled={!dirty || loading} onClick={onSave}>
				{loading ? <SpinnerIcon size={14} /> : t("common.save")}
			</button>
		</div>
	);
};
