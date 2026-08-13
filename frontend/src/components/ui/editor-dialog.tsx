import { X } from "lucide-react";
import {
	type FormEventHandler,
	type KeyboardEvent,
	type ReactNode,
	useCallback,
	useEffect,
	useId,
	useRef,
} from "react";
import { createPortal } from "react-dom";
import { useTouchEditing } from "../../hooks/use-touch-editing.ts";
import { ActionBtn } from "./action-btn.tsx";
import styles from "./editor-dialog.module.css";

const FOCUSABLE =
	'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
}: EditorDialogProps) {
	const titleId = useId();
	const touchEditing = useTouchEditing();
	const dialogRef = useRef<HTMLDialogElement>(null);
	const titleRef = useRef<HTMLHeadingElement>(null);
	const previousFocusRef = useRef<HTMLElement | null>(
		returnFocusTo ??
			(document.activeElement instanceof HTMLElement ? document.activeElement : null),
	);
	const restoreFocusFrameRef = useRef<number | null>(null);

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

	const handleKeyDown = useCallback(
		(event: KeyboardEvent<HTMLDialogElement>) => {
			if (event.key === "Escape" && !busy) {
				event.preventDefault();
				onClose();
				return;
			}
			if (event.key !== "Tab" || !dialogRef.current) return;
			const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
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
			data-touch-editing={touchEditing ? "true" : undefined}
			aria-modal="true"
			aria-labelledby={titleId}
			aria-busy={busy}
			onKeyDown={handleKeyDown}
			onCancel={(event) => {
				event.preventDefault();
				if (!busy) onClose();
			}}
		>
			<form className={styles.form} onSubmit={onSubmit} noValidate>
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
				<footer
					className={styles.footer}
					aria-hidden={touchEditing || undefined}
					inert={touchEditing || undefined}
				>
					{footer}
				</footer>
			</form>
		</dialog>,
		document.body,
	);
}
