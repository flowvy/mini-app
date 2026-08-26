import { ChevronRight } from "lucide-react";
import { type FC, type MouseEvent, type ReactNode, useId } from "react";
import { FormSurfaceBody } from "../ui/form-section.tsx";
import styles from "./settings-surface.module.css";

type SettingsTone = "default" | "positive" | "warning" | "negative";

interface SettingsSectionProps {
	title: string;
	action?: ReactNode;
	children: ReactNode;
}

export const SettingsSection: FC<SettingsSectionProps> = ({ title, action, children }) => {
	const headingId = useId();

	return (
		<section className={styles.section} aria-labelledby={headingId}>
			<div className={styles.surface} data-ui="settings-surface">
				<div className={styles.sectionHeading}>
					<h2 id={headingId}>{title}</h2>
					{action && <div className={styles.sectionAction}>{action}</div>}
				</div>
				{children}
			</div>
		</section>
	);
};

interface SettingsPanelProps {
	title: string;
	action?: ReactNode;
	children: ReactNode;
}

export const SettingsPanel: FC<SettingsPanelProps> = ({ title, action, children }) => {
	const headingId = useId();

	return (
		<section className={styles.panel} aria-labelledby={headingId}>
			<div className={styles.surface} data-ui="settings-surface">
				<div className={styles.panelHeading}>
					<h2 id={headingId}>{title}</h2>
					{action && <div className={styles.panelAction}>{action}</div>}
				</div>
				{children}
			</div>
		</section>
	);
};

export const SettingsFields: FC<{ children: ReactNode }> = ({ children }) => (
	<FormSurfaceBody className={styles.fields} dataUi="settings-fields">
		{children}
	</FormSurfaceBody>
);

export const SettingsInset: FC<{ children: ReactNode }> = ({ children }) => (
	<div className={styles.inset} data-ui="settings-inset">
		{children}
	</div>
);

export const SettingsDivider: FC = () => (
	<div className={styles.divider} data-ui="settings-divider" />
);

interface SettingsChoiceRowProps {
	name: string;
	value: string;
	checked: boolean;
	label: string;
	description: string;
	selectedLabel: string;
	disabled?: boolean;
	onChange: () => void;
}

export const SettingsChoiceRow: FC<SettingsChoiceRowProps> = ({
	name,
	value,
	checked,
	label,
	description,
	selectedLabel,
	disabled,
	onChange,
}) => (
	<label className={styles.choiceRow}>
		<input
			type="radio"
			name={name}
			value={value}
			checked={checked}
			disabled={disabled}
			aria-label={label}
			onChange={onChange}
		/>
		<span className={styles.navCopy}>
			<strong>{label}</strong>
			<small>{description}</small>
		</span>
		{checked && <span className={styles.activeChoice}>{selectedLabel}</span>}
	</label>
);

interface SettingsActionRowProps {
	icon: ReactNode;
	label: string;
	description?: string;
	disabled?: boolean;
	onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}

export const SettingsActionRow: FC<SettingsActionRowProps> = ({
	icon,
	label,
	description,
	disabled,
	onClick,
}) => (
	<button type="button" className={styles.actionRow} onClick={onClick} disabled={disabled}>
		<span className={styles.actionIcon}>{icon}</span>
		<span className={styles.actionCopy}>
			<strong>{label}</strong>
			{description && <small>{description}</small>}
		</span>
		<ChevronRight size={15} aria-hidden="true" />
	</button>
);

export const SettingsInlineNotice: FC<{
	icon: ReactNode;
	tone: "neutral" | "warning";
	children: ReactNode;
}> = ({ icon, tone, children }) => (
	<div className={styles.inlineNotice} data-tone={tone} role="note">
		<span className={styles.inlineNoticeIcon}>{icon}</span>
		<span>{children}</span>
	</div>
);

interface SettingsNavRowProps {
	icon: ReactNode;
	label: string;
	description: string;
	value?: string;
	tone?: SettingsTone;
	onClick: () => void;
}

export const SettingsNavRow: FC<SettingsNavRowProps> = ({
	icon,
	label,
	description,
	value,
	tone = "default",
	onClick,
}) => (
	<button type="button" className={styles.navRow} onClick={onClick}>
		<span className={styles.navIcon}>{icon}</span>
		<span className={styles.navCopy}>
			<strong>{label}</strong>
			<small>{description}</small>
		</span>
		<span className={styles.navTrailing}>
			{value && (
				<span className={styles.statusPill} data-tone={tone}>
					{value}
				</span>
			)}
			<ChevronRight size={15} aria-hidden="true" />
		</span>
	</button>
);

interface SettingsStatusRowProps {
	label: string;
	status?: string;
	tone?: SettingsTone;
	description?: string;
	action?: ReactNode;
	className?: string;
}

export const SettingsStatusRow: FC<SettingsStatusRowProps> = ({
	label,
	status,
	tone = "default",
	description,
	action,
	className,
}) => (
	<div className={`${styles.statusRow} ${className ?? ""}`}>
		<div className={styles.statusCopy}>
			<span className={styles.statusLabel}>{label}</span>
			{status && (
				<span className={styles.statusValue} data-tone={tone}>
					<span className={styles.statusDot} aria-hidden="true" />
					{status}
				</span>
			)}
			{description && <small>{description}</small>}
		</div>
		{action && <div className={styles.statusAction}>{action}</div>}
	</div>
);

interface SettingsFactRowProps {
	icon: ReactNode;
	label: string;
	value: string;
	tone?: SettingsTone;
}

export const SettingsFactRow: FC<SettingsFactRowProps> = ({
	icon,
	label,
	value,
	tone = "default",
}) => (
	<div className={styles.factRow}>
		<span className={styles.factIcon}>{icon}</span>
		<span className={styles.factLabel}>{label}</span>
		<span className={styles.factValue} data-tone={tone}>
			{value}
		</span>
	</div>
);
