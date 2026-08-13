/**
 * Action button — matches Desktop ActionButton.module.css.
 * Variants: action (outline), confirm (solid CTA), ghost (text-only).
 * Sizes: sm, md.
 */
import { type ButtonHTMLAttributes, type ReactNode, forwardRef } from "react";
import styles from "./action-btn.module.css";
import { SpinnerIcon } from "./spinner-icon.tsx";

interface ActionBtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: "action" | "confirm" | "ghost" | "danger" | "dangerOutline";
	size?: "sm" | "md";
	loading?: boolean;
	children: ReactNode;
}

export const ActionBtn = forwardRef<HTMLButtonElement, ActionBtnProps>(function ActionBtn(
	{ variant = "confirm", size = "sm", loading, children, className, disabled, ...rest },
	ref,
) {
	const cls = [
		styles.btn,
		styles[variant],
		styles[size],
		loading ? styles.loading : "",
		className ?? "",
	]
		.filter(Boolean)
		.join(" ");

	return (
		<button
			ref={ref}
			type="button"
			className={cls}
			disabled={disabled || loading}
			aria-busy={loading || undefined}
			{...rest}
		>
			{loading ? (
				<>
					<span className={styles.content} data-loading-hidden="">
						{children}
					</span>
					<span className={styles.loadingIndicator}>
						<SpinnerIcon size={size === "sm" ? 12 : 13} />
					</span>
				</>
			) : (
				children
			)}
		</button>
	);
});
