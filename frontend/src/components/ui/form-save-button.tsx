import { type FC, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
	mountTelegramEditorButtons,
	type TelegramEditorButtonsController,
} from "../../lib/telegram-editor-buttons.ts";
import styles from "./form-save-button.module.css";
import { SpinnerIcon } from "./spinner-icon.tsx";

interface FormSaveButtonProps {
	dirty: boolean;
	loading?: boolean;
	disabled?: boolean;
	label?: string;
	onSave: () => void;
	telegramMainButton?: boolean;
	telegramMainButtonVisible?: boolean;
}

export const FormSaveButton: FC<FormSaveButtonProps> = ({
	dirty,
	loading,
	disabled = false,
	label,
	onSave,
	telegramMainButton = false,
	telegramMainButtonVisible = true,
}) => {
	const { t } = useTranslation();
	const active = dirty && !disabled;
	const buttonLabel = label ?? t("common.save");
	const onSaveRef = useRef(onSave);
	const nativeStateRef = useRef({
		primaryText: buttonLabel,
		primaryEnabled: active && !loading,
		primaryLoading: Boolean(loading),
		primaryVisible: telegramMainButtonVisible,
	});
	const controllerRef = useRef<TelegramEditorButtonsController | null>(null);
	onSaveRef.current = onSave;
	nativeStateRef.current = {
		primaryText: buttonLabel,
		primaryEnabled: active && !loading,
		primaryLoading: Boolean(loading),
		primaryVisible: telegramMainButtonVisible,
	};

	useEffect(() => {
		if (!telegramMainButton) return;
		const controller = mountTelegramEditorButtons(nativeStateRef.current, {
			onPrimary: () => onSaveRef.current(),
		});
		controllerRef.current = controller;
		return () => {
			controller?.destroy();
			controllerRef.current = null;
		};
	}, [telegramMainButton]);

	useEffect(() => {
		const controller = controllerRef.current;
		if (!controller) return;
		if (
			controller.update({
				primaryText: buttonLabel,
				primaryEnabled: active && !loading,
				primaryLoading: Boolean(loading),
				primaryVisible: telegramMainButtonVisible,
			})
		) {
			return;
		}
		controller.destroy();
		controllerRef.current = null;
	}, [active, buttonLabel, loading, telegramMainButtonVisible]);

	if (telegramMainButton) return null;

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
