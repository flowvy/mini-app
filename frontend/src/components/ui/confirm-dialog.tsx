/**
 * Confirm dialog — matches Desktop Modal + ConfirmDialog pattern.
 * Header with title + close button, body, footer with action buttons.
 */
import { X } from "lucide-react";
import { type FC, type ReactNode, type RefObject, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
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
	returnFocusRef?: RefObject<HTMLElement | null>;
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
	returnFocusRef,
}) => {
	const { t } = useTranslation();
	const modalRef = useRef<HTMLDialogElement>(null);
	const closeRef = useRef<HTMLButtonElement>(null);
	const fallbackFocusRef = useRef<HTMLElement | null>(null);

	useEffect(() => {
		if (!open) return;
		fallbackFocusRef.current =
			document.activeElement instanceof HTMLElement ? document.activeElement : null;
		const modal = modalRef.current;
		if (modal && !modal.open) modal.showModal();
		closeRef.current?.focus();
		return () => {
			if (modal?.open) modal.close();
		};
	}, [open]);

	const restoreTriggerFocus = () => {
		const target = returnFocusRef?.current ?? fallbackFocusRef.current;
		window.setTimeout(() => {
			const liveTarget = returnFocusRef?.current ?? target;
			if (liveTarget?.isConnected) liveTarget.focus();
		}, 50);
	};

	const cancel = () => {
		onCancel();
		restoreTriggerFocus();
	};

	const confirm = () => {
		onConfirm();
		restoreTriggerFocus();
	};

	if (!open) return null;

	return createPortal(
		<dialog
			ref={modalRef}
			className={styles.modal}
			aria-label={title}
			aria-modal="true"
			onClick={(event) => {
				if (event.target === modalRef.current) cancel();
			}}
			onKeyDown={(event) => {
				if (event.key === "Escape") {
					event.preventDefault();
					cancel();
				}
				if (event.key !== "Tab" || !modalRef.current) return;
				const focusable = Array.from(
					modalRef.current.querySelectorAll<HTMLElement>(
						'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
					),
				);
				if (focusable.length === 0) return;
				const first = focusable[0];
				const last = focusable[focusable.length - 1];
				if (event.shiftKey && document.activeElement === first) {
					event.preventDefault();
					last.focus();
				} else if (!event.shiftKey && document.activeElement === last) {
					event.preventDefault();
					first.focus();
				}
			}}
			onCancel={(event) => {
				event.preventDefault();
				cancel();
			}}
		>
			<div className={styles.header}>
				<span className={styles.title}>{title}</span>
				<button
					ref={closeRef}
					type="button"
					className={styles.closeBtn}
					onClick={cancel}
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
						cancel();
					}}
				>
					{cancelLabel}
				</ActionBtn>
				<ActionBtn
					variant={confirmVariant}
					size="md"
					onClick={() => {
						hapticNotification("warning");
						confirm();
					}}
				>
					{confirmLabel}
				</ActionBtn>
			</div>
		</dialog>,
		document.body,
	);
};
