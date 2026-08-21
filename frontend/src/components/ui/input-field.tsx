/**
 * Text input — matches Desktop fv-input from global.css.
 */
import type { FC } from "react";
import { type ImeActionHint, handleImeKeyDown } from "../../lib/ime.ts";
import styles from "./input-field.module.css";

interface InputFieldProps {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	disabled?: boolean;
	enterKeyHint: ImeActionHint;
}

export const InputField: FC<InputFieldProps> = ({
	value,
	onChange,
	placeholder,
	disabled,
	enterKeyHint,
}) => {
	return (
		<input
			type="text"
			value={value}
			onChange={(e) => onChange(e.target.value)}
			placeholder={placeholder}
			disabled={disabled}
			enterKeyHint={enterKeyHint}
			onKeyDown={(event) => handleImeKeyDown(event, enterKeyHint)}
			className={styles.input}
		/>
	);
};
