/**
 * Text input — matches Desktop fv-input from global.css.
 */
import { type FC, useState } from "react";
import { dismissKeyboardOnEnter } from "../../lib/keyboard.ts";
import styles from "./input-field.module.css";

interface InputFieldProps {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	disabled?: boolean;
}

export const InputField: FC<InputFieldProps> = ({ value, onChange, placeholder, disabled }) => {
	const [focused, setFocused] = useState(false);

	return (
		<input
			type="text"
			value={value}
			onChange={(e) => onChange(e.target.value)}
			onKeyDown={dismissKeyboardOnEnter}
			placeholder={placeholder}
			disabled={disabled}
			enterKeyHint="done"
			onFocus={() => setFocused(true)}
			onBlur={() => setFocused(false)}
			className={`${styles.input} ${focused ? styles.focused : ""}`}
		/>
	);
};
