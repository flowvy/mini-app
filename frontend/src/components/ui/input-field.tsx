/**
 * Text input — matches Desktop fv-input from global.css.
 */
import type { FC } from "react";
import styles from "./input-field.module.css";

interface InputFieldProps {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	disabled?: boolean;
}

export const InputField: FC<InputFieldProps> = ({ value, onChange, placeholder, disabled }) => {
	return (
		<input
			type="text"
			value={value}
			onChange={(e) => onChange(e.target.value)}
			placeholder={placeholder}
			disabled={disabled}
			enterKeyHint="done"
			className={styles.input}
		/>
	);
};
