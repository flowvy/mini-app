/**
 * Confirm dialog — matches Desktop Modal + ConfirmDialog pattern.
 * Header with title + close button, body, footer with action buttons.
 */
import { popup } from "@telegram-apps/sdk-react";
import { X } from "lucide-react";
import {
	type FC,
	type ReactNode,
	type RefObject,
	useEffect,
	useId,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useBackNavigationHandler } from "../../contexts/back-navigation-context.tsx";
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
	confirmLoading?: boolean;
	confirmDisabled?: boolean;
	initialFocus?: "title" | "cancel";
	alert?: boolean;
	telegramNativeMessage?: string;
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
	initialFocus = "title",
	alert = false,
	telegramNativeMessage,
	onConfirm,
	onCancel,
	returnFocusRef,
}) => {
	const { t } = useTranslation();
	const titleId = useId();
	const descriptionId = useId();
	const modalRef = useRef<HTMLDialogElement>(null);
	const titleRef = useRef<HTMLHeadingElement>(null);
	const cancelButtonRef = useRef<HTMLButtonElement>(null);
	const fallbackFocusRef = useRef<HTMLElement | null>(null);
	const restoreFocusFrameRef = useRef<number | null>(null);
	const nativeRequestRef = useRef<ReturnType<typeof popup.show> | null>(null);
	const mountedRef = useRef(false);
	const onConfirmRef = useRef(onConfirm);
	const onCancelRef = useRef(onCancel);
	const [nativePopupFailed, setNativePopupFailed] = useState(false);

	useLayoutEffect(() => {
		onConfirmRef.current = onConfirm;
		onCancelRef.current = onCancel;
	});

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
		};
	}, []);

	let nativePopupAvailable = false;
	try {
		nativePopupAvailable = Boolean(
			telegramNativeMessage && popup.show.isAvailable() && !nativePopupFailed,
		);
	} catch {
		nativePopupAvailable = false;
	}

	useEffect(() => {
		if (!open) {
			setNativePopupFailed(false);
			return;
		}
		if (!nativePopupAvailable || !telegramNativeMessage || nativeRequestRef.current) return;

		let request: ReturnType<typeof popup.show>;
		try {
			request = popup.show({
				title,
				message: telegramNativeMessage,
				buttons: [
					{
						id: "confirm",
						text: confirmLabel,
						type: confirmVariant === "danger" ? "destructive" : "default",
					},
					{ id: "cancel", text: cancelLabel },
				],
			});
		} catch {
			setNativePopupFailed(true);
			return;
		}
		nativeRequestRef.current = request;
		void request
			.then((buttonId) => {
				if (!mountedRef.current) return;
				if (buttonId === "confirm") onConfirmRef.current();
				else onCancelRef.current();
			})
			.catch(() => {
				if (mountedRef.current) setNativePopupFailed(true);
			})
			.finally(() => {
				if (nativeRequestRef.current === request) nativeRequestRef.current = null;
			});
	}, [
		cancelLabel,
		confirmLabel,
		confirmVariant,
		nativePopupAvailable,
		open,
		telegramNativeMessage,
		title,
	]);

	useLayoutEffect(() => {
		if (!open || nativePopupAvailable) return;
		if (restoreFocusFrameRef.current !== null) {
			window.cancelAnimationFrame(restoreFocusFrameRef.current);
			restoreFocusFrameRef.current = null;
		}
		fallbackFocusRef.current =
			document.activeElement instanceof HTMLElement ? document.activeElement : null;
		const modal = modalRef.current;
		if (modal && !modal.open) modal.showModal();
		if (initialFocus === "cancel") cancelButtonRef.current?.focus();
		else titleRef.current?.focus();
		return () => {
			if (modal?.open) modal.close();
			const target = returnFocusRef?.current ?? fallbackFocusRef.current;
			restoreFocusFrameRef.current = window.requestAnimationFrame(() => {
				restoreFocusFrameRef.current = null;
				const liveTarget = returnFocusRef?.current ?? target;
				if (liveTarget?.isConnected) liveTarget.focus({ preventScroll: true });
			});
		};
	}, [initialFocus, nativePopupAvailable, open, returnFocusRef]);

	const cancel = () => {
		if (confirmLoading) return;
		onCancel();
	};

	const confirm = () => {
		if (confirmLoading || confirmDisabled) return;
		onConfirm();
	};
	useBackNavigationHandler(cancel, open && !nativePopupAvailable);

	if (!open || nativePopupAvailable) return null;

	return createPortal(
		<dialog
			ref={modalRef}
			className={styles.modal}
			role={alert ? "alertdialog" : undefined}
			aria-labelledby={titleId}
			aria-describedby={alert ? descriptionId : undefined}
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
			<div id={descriptionId} className={styles.body}>
				{children}
			</div>
			<div className={styles.footer}>
				<ActionBtn
					ref={cancelButtonRef}
					variant="ghost"
					size="md"
					disabled={confirmLoading}
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
