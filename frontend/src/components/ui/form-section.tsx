import type { FC, ReactNode } from "react";
import styles from "./form-section.module.css";

interface FormSectionHeaderProps {
	children: string;
}

export const FormSectionHeader: FC<FormSectionHeaderProps> = ({ children }) => (
	<div className={styles.header}>{children}</div>
);

interface FormSectionFooterProps {
	children: ReactNode;
	warning?: boolean;
}

export const FormSectionFooter: FC<FormSectionFooterProps> = ({ children, warning }) => (
	<div className={`${styles.footer} ${warning ? styles.warning : ""}`}>{children}</div>
);

export const FormSectionCard: FC<{ children: ReactNode }> = ({ children }) => (
	<div className={styles.card}>{children}</div>
);

interface FormRowProps {
	label: string;
	children: ReactNode;
}

export const FormRow: FC<FormRowProps> = ({ label, children }) => (
	<div className={styles.row}>
		<span className={styles.rowLabel}>{label}</span>
		<div className={styles.rowValue}>{children}</div>
	</div>
);

export const FormRowSeparator: FC = () => <div className={styles.separator} />;

interface FormTextareaProps {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	rows?: number;
	disabled?: boolean;
}

export const FormTextarea: FC<FormTextareaProps> = ({
	value,
	onChange,
	placeholder,
	rows = 4,
	disabled,
}) => (
	<div className={styles.textareaWrap}>
		<textarea
			value={value}
			onChange={(e) => onChange(e.target.value)}
			placeholder={placeholder}
			rows={rows}
			disabled={disabled}
			className={styles.textarea}
		/>
	</div>
);

interface FormInlineInputProps {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	mono?: boolean;
	disabled?: boolean;
}

export const FormInlineInput: FC<FormInlineInputProps> = ({
	value,
	onChange,
	placeholder,
	mono,
	disabled,
}) => (
	<input
		type="text"
		value={value}
		onChange={(e) => onChange(e.target.value)}
		placeholder={placeholder}
		disabled={disabled}
		className={`${styles.inlineInput} ${mono ? styles.mono : ""}`}
	/>
);
