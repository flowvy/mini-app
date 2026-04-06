/**
 * Lightweight confirm dialog — based on Desktop Modal + ConfirmDialog pattern.
 * Props-based (no global store), renders overlay with two action buttons.
 */
import { type FC, type ReactNode, useRef } from "react";
import { ActionBtn } from "./action-btn.tsx";
import styles from "./confirm-dialog.module.css";

interface ConfirmDialogProps {
	open: boolean;
	title: string;
	children: ReactNode;
	confirmLabel: string;
	cancelLabel: string;
	onConfirm: () => void;
	onCancel: () => void;
}

export const ConfirmDialog: FC<ConfirmDialogProps> = ({
	open,
	title,
	children,
	confirmLabel,
	cancelLabel,
	onConfirm,
	onCancel,
}) => {
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
				</div>
				<div className={styles.body}>{children}</div>
				<div className={styles.footer}>
					<ActionBtn variant="ghost" size="md" onClick={onCancel}>
						{cancelLabel}
					</ActionBtn>
					<ActionBtn variant="confirm" size="md" onClick={onConfirm}>
						{confirmLabel}
					</ActionBtn>
				</div>
			</dialog>
		</div>
	);
};
