/**
 * Text input — matches Desktop fv-input from global.css.
 */
import { type FC, useState } from "react";
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
			placeholder={placeholder}
			disabled={disabled}
			onFocus={() => setFocused(true)}
			onBlur={() => setFocused(false)}
			className={`${styles.input} ${focused ? styles.focused : ""}`}
		/>
	);
};
