import type { FC } from "react";
import { hapticImpact } from "../../lib/haptics.ts";
import styles from "./toggle.module.css";

interface ToggleProps {
	checked: boolean;
	onChange: (checked: boolean) => void;
	disabled?: boolean;
	ariaDisabled?: boolean;
	ariaDescribedBy?: string;
	ariaLabel?: string;
}

export const Toggle: FC<ToggleProps> = ({
	checked,
	onChange,
	disabled,
	ariaDisabled,
	ariaDescribedBy,
	ariaLabel,
}) => {
	return (
		<button
			type="button"
			role="switch"
			aria-checked={checked}
			aria-disabled={ariaDisabled || undefined}
			aria-describedby={ariaDescribedBy}
			aria-label={ariaLabel}
			className={`${styles.track} ${checked ? styles.on : ""}`}
			disabled={disabled}
			onClick={() => {
				if (ariaDisabled) return;
				hapticImpact("medium");
				onChange(!checked);
			}}
		>
			<span className={styles.knob} />
		</button>
	);
};
