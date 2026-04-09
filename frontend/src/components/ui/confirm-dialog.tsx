/**
 * Confirm dialog — matches Desktop Modal + ConfirmDialog pattern.
 * Header with title + close button, body, footer with action buttons.
 */
import { X } from "lucide-react";
import { type FC, type ReactNode, useRef } from "react";
import { useTranslation } from "react-i18next";
import { hapticImpact, hapticNotification } from "../../lib/haptics.ts";
import { ActionBtn } from "./action-btn.tsx";
import styles from "./confirm-dialog.module.css";

interface ConfirmDialogProps {
	open: boolean;
	title: string;
	children: ReactNode;
	confirmLabel: string;
	cancelLabel: string;
	confirmVariant?: "confirm" | "danger";
	onConfirm: () => void;
	onCancel: () => void;
}

export const ConfirmDialog: FC<ConfirmDialogProps> = ({
	open,
	title,
	children,
	confirmLabel,
	cancelLabel,
	confirmVariant = "confirm",
	onConfirm,
	onCancel,
}) => {
	const { t } = useTranslation();
	const overlayRef = useRef<HTMLDivElement>(null);

	if (!open) return null;

	return (
		<div
			ref={overlayRef}
			className={styles.overlay}
			onClick={(e) => {
				if (e.target === overlayRef.current) onCancel();
			}}
			onKeyDown={(e) => {
				if (e.key === "Escape") onCancel();
			}}
		>
			<dialog open className={styles.modal} aria-label={title}>
				<div className={styles.header}>
					<span className={styles.title}>{title}</span>
					<button
						type="button"
						className={styles.closeBtn}
						onClick={onCancel}
						aria-label={t("common.confirmDialog.closeLabel")}
					>
						<X size={16} />
					</button>
				</div>
				<div className={styles.body}>{children}</div>
				<div className={styles.footer}>
					<ActionBtn
						variant="ghost"
						size="md"
						onClick={() => {
							hapticImpact("light");
							onCancel();
						}}
					>
						{cancelLabel}
					</ActionBtn>
					<ActionBtn
						variant={confirmVariant}
						size="md"
						onClick={() => {
							hapticNotification("warning");
							onConfirm();
						}}
					>
						{confirmLabel}
					</ActionBtn>
				</div>
			</dialog>
		</div>
	);
};
