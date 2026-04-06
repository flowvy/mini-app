/**
 * Action button — matches Desktop ActionButton.module.css.
 * Variants: action (outline), confirm (solid CTA), ghost (text-only).
 * Sizes: sm, md.
 */
import type { ButtonHTMLAttributes, FC, ReactNode } from "react";
import styles from "./action-btn.module.css";

interface ActionBtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: "action" | "confirm" | "ghost";
	size?: "sm" | "md";
	loading?: boolean;
	children: ReactNode;
}

export const ActionBtn: FC<ActionBtnProps> = ({
	variant = "confirm",
	size = "sm",
	loading,
	children,
	className,
	disabled,
	...rest
}) => {
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
		<button type="button" className={cls} disabled={disabled || loading} {...rest}>
			{loading ? <SpinnerIcon size={size === "sm" ? 12 : 13} /> : children}
		</button>
	);
};

function SpinnerIcon({ size = 14 }: { size?: number }) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2.5"
			strokeLinecap="round"
			style={{ animation: "var(--fv-anim-spin) 0.8s linear infinite" }}
			aria-hidden="true"
		>
			<path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4" />
		</svg>
	);
}
