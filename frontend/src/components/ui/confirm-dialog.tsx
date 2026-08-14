/**
 * Confirm dialog — matches Desktop Modal + ConfirmDialog pattern.
 * Header with title + close button, body, footer with action buttons.
 */
import { X } from "lucide-react";
import { type FC, type ReactNode, type RefObject, useId, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { hapticImpact, hapticNotification } from "../../lib/haptics.ts";
import { hideVirtualKeyboard } from "../../lib/telegram.ts";
import { isEditableControl } from "../../lib/visual-viewport.ts";
import { ActionBtn } from "./action-btn.tsx";
import styles from "./confirm-dialog.module.css";

interface ConfirmDialogProps {
	open: boolean;
	title: string;
	children: ReactNode;
	confirmLabel: string;
	cancelLabel: string;
	confirmVariant?: "confirm" | "danger";
	confirmLoading?: boolean;
	confirmDisabled?: boolean;
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
	confirmLoading = false,
	confirmDisabled = false,
	onConfirm,
	onCancel,
	returnFocusRef,
}) => {
	const { t } = useTranslation();
	const titleId = useId();
	const modalRef = useRef<HTMLDialogElement>(null);
	const titleRef = useRef<HTMLHeadingElement>(null);
	const fallbackFocusRef = useRef<HTMLElement | null>(null);
	const restoreFocusFrameRef = useRef<number | null>(null);

	useLayoutEffect(() => {
		if (!open) return;
		if (restoreFocusFrameRef.current !== null) {
			window.cancelAnimationFrame(restoreFocusFrameRef.current);
			restoreFocusFrameRef.current = null;
		}
		fallbackFocusRef.current =
			document.activeElement instanceof HTMLElement ? document.activeElement : null;
		const modal = modalRef.current;
		if (modal && !modal.open) modal.showModal();
		titleRef.current?.focus();
		return () => {
			if (modal?.open) modal.close();
			const target = returnFocusRef?.current ?? fallbackFocusRef.current;
			restoreFocusFrameRef.current = window.requestAnimationFrame(() => {
				restoreFocusFrameRef.current = null;
				const liveTarget = returnFocusRef?.current ?? target;
				if (liveTarget?.isConnected) liveTarget.focus({ preventScroll: true });
			});
		};
	}, [open, returnFocusRef]);

	const cancel = () => {
		if (confirmLoading) return;
		onCancel();
	};

	const confirm = () => {
		if (confirmLoading || confirmDisabled) return;
		onConfirm();
	};

	const dismissFocusedEditor = () => {
		const focused = document.activeElement;
		if (isEditableControl(focused) && modalRef.current?.contains(focused)) {
			hideVirtualKeyboard(focused);
		}
	};

	if (!open) return null;

	return createPortal(
		<dialog
			ref={modalRef}
			className={styles.modal}
			aria-labelledby={titleId}
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
				if (
					!(document.activeElement instanceof HTMLElement) ||
					!focusable.includes(document.activeElement)
				) {
					event.preventDefault();
					(event.shiftKey ? last : first).focus();
					return;
				}
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
				<h2 id={titleId} ref={titleRef} className={styles.title} tabIndex={-1}>
					{title}
				</h2>
				<button
					type="button"
					className={styles.closeBtn}
					onClick={cancel}
					disabled={confirmLoading}
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
					disabled={confirmLoading}
					onPointerDown={dismissFocusedEditor}
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
					loading={confirmLoading}
					disabled={confirmDisabled}
					onPointerDown={dismissFocusedEditor}
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
