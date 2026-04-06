/**
 * Toggle switch — matches Desktop Toggle.module.css exactly.
 */
import type { FC } from "react";
import styles from "./toggle.module.css";

interface ToggleProps {
	checked: boolean;
	onChange: (checked: boolean) => void;
	disabled?: boolean;
}

export const Toggle: FC<ToggleProps> = ({ checked, onChange, disabled }) => {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			className={`${styles.track} ${checked ? styles.on : ""}`}
			disabled={disabled}
			onClick={() => onChange(!checked)}
		>
			<span className={styles.knob} />
		</button>
	);
};
