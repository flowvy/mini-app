import type { CSSProperties } from "react";
import styles from "./spinner-icon.module.css";

interface SpinnerIconProps {
	size?: number;
	color?: string;
}

export function SpinnerIcon({ size = 20, color = "currentColor" }: SpinnerIconProps) {
	return (
		<span
			className={styles.spinner}
			style={
				{
					"--fv-spinner-size": `${size}px`,
					color,
				} as CSSProperties
			}
			data-loading-indicator=""
			aria-hidden="true"
		/>
	);
}
