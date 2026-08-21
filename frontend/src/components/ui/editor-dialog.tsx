import { X } from "lucide-react";
import {
	type FormEventHandler,
	type KeyboardEvent,
	type ReactNode,
	useCallback,
	useEffect,
	useId,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import { useBackNavigationHandler } from "../../contexts/back-navigation-context.tsx";
import {
	type TelegramEditorButtonsController,
	mountTelegramEditorButtons,
} from "../../lib/telegram-editor-buttons.ts";
import { ActionBtn } from "./action-btn.tsx";
import styles from "./editor-dialog.module.css";

const FOCUSABLE =
	'button:not([disabled]), summary, [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function isVisibleFocusTarget(element: HTMLElement): boolean {
	const closedDetails = element.closest("details:not([open])");
	if (closedDetails && closedDetails.querySelector(":scope > summary") !== element) return false;
	return element.getClientRects().length > 0;
}

interface TelegramFooterActions {
	primaryText: string;
	primaryDisabled: boolean;
	primaryVisible?: boolean;
}

interface EditorDialogProps {
	eyebrow: string;
	title: string;
	subtitle: string;
	closeLabel: string;
	busy: boolean;
	returnFocusTo: HTMLElement | null;
	onClose: () => void;
	onSubmit: FormEventHandler<HTMLFormElement>;
	children: ReactNode;
	footer: ReactNode;
	telegramFooter?: TelegramFooterActions;
}

/** Shared accessible, responsive editor shell for administrator configuration forms. */
export function EditorDialog({
	eyebrow,
	title,
	subtitle,
	closeLabel,
	busy,
	returnFocusTo,
	onClose,
	onSubmit,
	children,
	footer,
	telegramFooter,
}: EditorDialogProps) {
	const titleId = useId();
	const dialogRef = useRef<HTMLDialogElement>(null);
	const formRef = useRef<HTMLFormElement>(null);
	const titleRef = useRef<HTMLHeadingElement>(null);
	const busyRef = useRef(busy);
	const telegramButtonsRef = useRef<TelegramEditorButtonsController | null>(null);
	const initialTelegramFooterRef = useRef(telegramFooter);
	const [usesTelegramFooter, setUsesTelegramFooter] = useState(false);
	const previousFocusRef = useRef<HTMLElement | null>(
		returnFocusTo ??
			(document.activeElement instanceof HTMLElement ? document.activeElement : null),
	);
	const restoreFocusFrameRef = useRef<number | null>(null);
	const telegramPrimaryText = telegramFooter?.primaryText;
	const telegramPrimaryDisabled = telegramFooter?.primaryDisabled;
	const telegramPrimaryVisible = telegramFooter?.primaryVisible;
	busyRef.current = busy;
	useBackNavigationHandler(() => {
		if (!busy) onClose();
	});

	useEffect(() => {
		const dialog = dialogRef.current;
		if (restoreFocusFrameRef.current !== null) {
			window.cancelAnimationFrame(restoreFocusFrameRef.current);
			restoreFocusFrameRef.current = null;
		}
		if (dialog && !dialog.open) dialog.showModal();
		titleRef.current?.focus();
		return () => {
			if (dialog?.open) dialog.close();
			const previousFocus = previousFocusRef.current;
			restoreFocusFrameRef.current = window.requestAnimationFrame(() => {
				restoreFocusFrameRef.current = null;
				if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
			});
		};
	}, []);

	useEffect(() => {
		const initialTelegramFooter = initialTelegramFooterRef.current;
		if (!initialTelegramFooter) return;
		const controller = mountTelegramEditorButtons(
			{
				primaryText: initialTelegramFooter.primaryText,
				primaryEnabled: !initialTelegramFooter.primaryDisabled && !busyRef.current,
				primaryLoading: busyRef.current,
				primaryVisible: initialTelegramFooter.primaryVisible,
			},
			{
				onPrimary: () => formRef.current?.requestSubmit(),
			},
		);
		telegramButtonsRef.current = controller;
		setUsesTelegramFooter(controller !== null);

		return () => {
			controller?.destroy();
			telegramButtonsRef.current = null;
		};
	}, []);

	useEffect(() => {
		if (
			telegramPrimaryText === undefined ||
			telegramPrimaryDisabled === undefined ||
			!telegramButtonsRef.current
		) {
			return;
		}
		const updated = telegramButtonsRef.current.update({
			primaryText: telegramPrimaryText,
			primaryEnabled: !telegramPrimaryDisabled && !busy,
			primaryLoading: busy,
			primaryVisible: telegramPrimaryVisible,
		});
		if (!updated) {
			telegramButtonsRef.current.destroy();
			telegramButtonsRef.current = null;
			setUsesTelegramFooter(false);
		}
	}, [busy, telegramPrimaryDisabled, telegramPrimaryText, telegramPrimaryVisible]);

	const handleKeyDown = useCallback(
		(event: KeyboardEvent<HTMLDialogElement>) => {
			if (event.key === "Escape" && !busy) {
				event.preventDefault();
				onClose();
				return;
			}
			if (event.key !== "Tab" || !dialogRef.current) return;
			const focusable = Array.from(
				dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
			).filter(isVisibleFocusTarget);
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
		},
		[busy, onClose],
	);

	return createPortal(
		<dialog
			ref={dialogRef}
			className={styles.panel}
			aria-modal="true"
			aria-labelledby={titleId}
			aria-busy={busy}
			onKeyDown={handleKeyDown}
			onCancel={(event) => {
				event.preventDefault();
				if (!busy) onClose();
			}}
		>
			<form ref={formRef} className={styles.form} onSubmit={onSubmit} noValidate>
				<header className={styles.header}>
					<div>
						<p className={styles.eyebrow}>{eyebrow}</p>
						<h2 id={titleId} ref={titleRef} tabIndex={-1}>
							{title}
						</h2>
						<p className={styles.subtitle}>{subtitle}</p>
					</div>
					<ActionBtn
						variant="ghost"
						className={styles.closeButton}
						onClick={onClose}
						disabled={busy}
						aria-label={closeLabel}
					>
						<X size={18} />
					</ActionBtn>
				</header>
				<div className={styles.body}>{children}</div>
				{!usesTelegramFooter && <footer className={styles.footer}>{footer}</footer>}
			</form>
		</dialog>,
		document.body,
	);
}
