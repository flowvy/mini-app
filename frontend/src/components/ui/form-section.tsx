import { CalendarDays, ChevronDown } from "lucide-react";
import {
	type FC,
	type InputHTMLAttributes,
	type ReactNode,
	type SelectHTMLAttributes,
	type TextareaHTMLAttributes,
	forwardRef,
	useId,
} from "react";
import styles from "./form-section.module.css";

interface FormSectionProps {
	title: string;
	action?: ReactNode;
	children: ReactNode;
}

/** Shared attached header + content surface for named Mini App sections. */
export const FormSection: FC<FormSectionProps> = ({ title, action, children }) => {
	const headingId = useId();

	return (
		<section className={styles.section} aria-labelledby={headingId}>
			<div className={styles.header}>
				<h2 id={headingId}>{title}</h2>
				{action && <div className={styles.sectionAction}>{action}</div>}
			</div>
			{children}
		</section>
	);
};

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
	htmlFor?: string;
	children: ReactNode;
}

export const FormRow: FC<FormRowProps> = ({ label, htmlFor, children }) => (
	<div className={styles.row}>
		{htmlFor ? (
			<label className={styles.rowLabel} htmlFor={htmlFor}>
				{label}
			</label>
		) : (
			<span className={styles.rowLabel}>{label}</span>
		)}
		<div className={styles.rowValue}>{children}</div>
	</div>
);

export const FormRowSeparator: FC = () => <div className={styles.separator} />;

interface FormFieldProps {
	label: string;
	htmlFor?: string;
	hint?: ReactNode;
	notice?: ReactNode;
	children: ReactNode;
}

/** Stacked field used by full-width editor forms. */
export const FormField: FC<FormFieldProps> = ({ label, htmlFor, hint, notice, children }) => (
	<div className={styles.field}>
		{htmlFor ? (
			<label className={styles.fieldLabel} htmlFor={htmlFor}>
				{label}
			</label>
		) : (
			<span className={styles.fieldLabel}>{label}</span>
		)}
		{children}
		{hint && <small className={styles.fieldHint}>{hint}</small>}
		{notice && <div className={styles.fieldNotice}>{notice}</div>}
	</div>
);

export const FormFieldInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
	({ className, enterKeyHint = "done", ...props }, ref) => (
		<input
			ref={ref}
			className={`${styles.fieldControl} ${className ?? ""}`}
			enterKeyHint={enterKeyHint}
			{...props}
		/>
	),
);
FormFieldInput.displayName = "FormFieldInput";

export interface FormSelectOption {
	value: string;
	label: string;
	disabled?: boolean;
}

type FormSelectProps = Omit<
	SelectHTMLAttributes<HTMLSelectElement>,
	"children" | "multiple" | "size"
> & {
	options: readonly FormSelectOption[];
};

function selectedOptionLabel(
	options: readonly FormSelectOption[],
	value: SelectHTMLAttributes<HTMLSelectElement>["value"],
	defaultValue: SelectHTMLAttributes<HTMLSelectElement>["defaultValue"],
): string {
	const selectedValue = String(value ?? defaultValue ?? "");
	return options.find((option) => option.value === selectedValue)?.label ?? "";
}

export const FormFieldSelect = forwardRef<HTMLSelectElement, FormSelectProps>(
	({ className, options, value, defaultValue, disabled, ...props }, ref) => (
		<span
			className={`${styles.selectShell} ${styles.fieldSelectShell} ${className ?? ""}`}
			data-disabled={disabled ? "" : undefined}
		>
			<span className={styles.selectValue} aria-hidden="true">
				{selectedOptionLabel(options, value, defaultValue)}
			</span>
			<ChevronDown size={14} aria-hidden="true" />
			<select
				ref={ref}
				className={styles.nativeSelect}
				value={value}
				defaultValue={defaultValue}
				disabled={disabled}
				{...props}
			>
				{options.map((option) => (
					<option key={option.value} value={option.value} disabled={option.disabled}>
						{option.label}
					</option>
				))}
			</select>
		</span>
	),
);
FormFieldSelect.displayName = "FormFieldSelect";

export const FormFieldTextarea = forwardRef<
	HTMLTextAreaElement,
	TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
	<textarea
		ref={ref}
		className={`${styles.fieldControl} ${styles.fieldTextarea} ${className ?? ""}`}
		{...props}
	/>
));
FormFieldTextarea.displayName = "FormFieldTextarea";

export const FormInlineSelect = forwardRef<HTMLSelectElement, FormSelectProps>(
	({ className, options, value, defaultValue, disabled, ...props }, ref) => (
		<span
			className={`${styles.selectShell} ${styles.inlineSelectShell} ${className ?? ""}`}
			data-disabled={disabled ? "" : undefined}
		>
			<span className={styles.selectValue} aria-hidden="true">
				{selectedOptionLabel(options, value, defaultValue)}
			</span>
			<ChevronDown size={14} aria-hidden="true" />
			<select
				ref={ref}
				className={styles.nativeSelect}
				value={value}
				defaultValue={defaultValue}
				disabled={disabled}
				{...props}
			>
				{options.map((option) => (
					<option key={option.value} value={option.value} disabled={option.disabled}>
						{option.label}
					</option>
				))}
			</select>
		</span>
	),
);
FormInlineSelect.displayName = "FormInlineSelect";

interface FormInlineFieldProps {
	label: string;
	htmlFor: string;
	hint?: ReactNode;
	children: ReactNode;
}

/** Compact iOS-style label/value row for pickers in constrained forms. */
export const FormInlineField: FC<FormInlineFieldProps> = ({ label, htmlFor, hint, children }) => (
	<fieldset className={styles.inlineFieldGroup} aria-label={label}>
		<div className={styles.inlineFieldRow}>
			<label className={styles.inlineFieldLabel} htmlFor={htmlFor}>
				{label}
			</label>
			<div className={styles.inlineFieldValue}>{children}</div>
		</div>
		{hint && <small className={styles.fieldHint}>{hint}</small>}
	</fieldset>
);

type FormInlineDateProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
	displayValue: string;
};

export const FormInlineDate = forwardRef<HTMLInputElement, FormInlineDateProps>(
	({ className, displayValue, disabled, ...props }, ref) => (
		<span
			className={`${styles.dateShell} ${className ?? ""}`}
			data-disabled={disabled ? "" : undefined}
		>
			<span className={styles.dateValue} aria-hidden="true">
				{displayValue}
			</span>
			<CalendarDays size={14} aria-hidden="true" />
			<input ref={ref} type="date" className={styles.nativeDate} disabled={disabled} {...props} />
		</span>
	),
);
FormInlineDate.displayName = "FormInlineDate";

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
	id?: string;
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	mono?: boolean;
	disabled?: boolean;
	type?: "text" | "url";
}

export const FormInlineInput: FC<FormInlineInputProps> = ({
	id,
	value,
	onChange,
	placeholder,
	mono,
	disabled,
	type = "text",
}) => (
	<input
		id={id}
		type={type}
		value={value}
		onChange={(e) => onChange(e.target.value)}
		placeholder={placeholder}
		disabled={disabled}
		enterKeyHint="done"
		inputMode={type === "url" ? "url" : "text"}
		autoCapitalize={type === "url" || mono ? "none" : undefined}
		autoCorrect={type === "url" || mono ? "off" : undefined}
		spellCheck={type === "url" || mono ? false : undefined}
		className={`${styles.inlineInput} ${mono ? styles.mono : ""}`}
	/>
);
