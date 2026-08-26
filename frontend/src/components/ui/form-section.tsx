import { CalendarDays, ChevronDown } from "lucide-react";
import {
	type FC,
	forwardRef,
	type HTMLAttributes,
	type InputHTMLAttributes,
	type ReactNode,
	type SelectHTMLAttributes,
	type TextareaHTMLAttributes,
	useId,
} from "react";
import { handleImeKeyDown, type ImeActionHint } from "../../lib/ime.ts";
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

export const FormSectionCard: FC<{ children: ReactNode }> = ({ children }) => (
	<div className={styles.card} data-ui="form-section-card">
		{children}
	</div>
);

interface FormSurfaceBodyProps extends HTMLAttributes<HTMLDivElement> {
	dataUi?: string;
}

/** Shared body layout for framed forms; the owning card supplies the surface. */
export const FormSurfaceBody: FC<FormSurfaceBodyProps> = ({
	children,
	className,
	dataUi = "form-surface-body",
	...props
}) => (
	<div {...props} className={`${styles.surfaceBody} ${className ?? ""}`} data-ui={dataUi}>
		{children}
	</div>
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

interface FormFieldInputProps extends InputHTMLAttributes<HTMLInputElement> {
	enterKeyHint: ImeActionHint;
	onImeAction?: () => void;
}

export const FormFieldInput = forwardRef<HTMLInputElement, FormFieldInputProps>(
	({ className, enterKeyHint, onImeAction, onKeyDown, ...props }, ref) => (
		<input
			ref={ref}
			className={`${styles.fieldControl} ${className ?? ""}`}
			enterKeyHint={enterKeyHint}
			onKeyDown={(event) => {
				onKeyDown?.(event);
				if (!event.defaultPrevented) handleImeKeyDown(event, enterKeyHint, onImeAction);
			}}
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
		enterKeyHint="enter"
		{...props}
	/>
));
FormFieldTextarea.displayName = "FormFieldTextarea";

interface FormInlineFieldProps {
	label: string;
	htmlFor: string;
	hint?: ReactNode;
	children: ReactNode;
}

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
