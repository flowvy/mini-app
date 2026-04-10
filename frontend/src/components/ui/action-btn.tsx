/**
 * Action button — matches Desktop ActionButton.module.css.
 * Variants: action (outline), confirm (solid CTA), ghost (text-only).
 * Sizes: sm, md.
 */
import type { ButtonHTMLAttributes, FC, ReactNode } from "react";
import styles from "./action-btn.module.css";
import { SpinnerIcon } from "./spinner-icon.tsx";

interface ActionBtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: "action" | "confirm" | "ghost" | "danger" | "dangerOutline";
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
