/** Admin Settings page — main list, sub-screens are separate routes. */
import { useNavigate } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type { FC } from "react";
import { useTranslation } from "react-i18next";
import {
	FormRow,
	FormRowSeparator,
	FormSectionCard,
	FormSectionHeader,
} from "../../components/ui/form-section.tsx";
import { InlineFeedback } from "../../components/ui/inline-feedback.tsx";
import { LoadErrorState } from "../../components/ui/load-error-state.tsx";
import { PageLoading } from "../../components/ui/page-loading.tsx";
import { SegmentedControl } from "../../components/ui/segmented-control.tsx";
import { useAdminSettings, useUpdateSettings } from "../../hooks/use-admin-settings.ts";
import { useRegistrationSettings } from "../../hooks/use-registration-admin.ts";
import type { PulseProvider } from "../../types/admin-settings.ts";
import styles from "./settings.module.css";

interface SettingsToolRowProps {
	label: string;
	desc?: string;
	value?: string;
	valuePositive?: boolean;
	onClick: () => void;
}

const SettingsToolRow: FC<SettingsToolRowProps> = ({
	label,
	desc,
	value,
	valuePositive,
	onClick,
}) => (
	<button type="button" className={styles.toolRow} onClick={onClick}>
		<div className={styles.toolRowLeft}>
			<span className={styles.toolRowLabel}>{label}</span>
			{desc && <span className={styles.toolRowDesc}>{desc}</span>}
		</div>
		<span className={styles.toolRowRight}>
			{value && (
				<span className={valuePositive ? styles.rowValuePositive : styles.rowValue}>{value}</span>
			)}
			<span className={styles.toolRowChevron}>
				<ChevronRight size={14} />
			</span>
		</span>
	</button>
);

export const AdminSettings: FC = () => {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const { settings, isPending, error, refetch } = useAdminSettings();
	const updateMutation = useUpdateSettings();
	const registration = useRegistrationSettings();

	if (isPending || (!settings && !error)) {
		return <PageLoading />;
	}

	if (error || !settings) {
		return <LoadErrorState onRetry={refetch} />;
	}

	const kumaConfigured = Boolean(settings.kumaUrl && settings.kumaSlug);
	const beszelConfigured = Boolean(settings.beszelUrl && settings.beszelCredentialsConfigured);
	const handleProviderChange = (provider: string) => {
		const nextProvider = provider as PulseProvider;
		if (nextProvider === settings.pulseProvider) return;
		updateMutation.reset();
		if (nextProvider === "kuma" && !kumaConfigured) {
			void navigate({ to: "/admin/settings/kuma" });
			return;
		}
		if (nextProvider === "beszel" && !beszelConfigured) {
			void navigate({ to: "/admin/settings/beszel" });
			return;
		}
		updateMutation.mutate({ pulseProvider: nextProvider });
	};
	const providerOptions = [
		{ key: "disabled", label: t("settings.providerDisabled") },
		{ key: "kuma", label: t("settings.providerKuma") },
		{ key: "beszel", label: t("settings.providerBeszel") },
	];

	return (
		<div className={styles.page}>
			{updateMutation.isError && <InlineFeedback>{t("settings.saveError")}</InlineFeedback>}
			<FormSectionHeader>{t("settings.integrations")}</FormSectionHeader>
			<FormSectionCard>
				<div className={styles.providerRow}>
					<div className={styles.providerHeading}>
						<span className={styles.providerLabel}>{t("settings.pulseProvider")}</span>
						<span className={styles.providerDescription}>{t("settings.integrationsHint")}</span>
					</div>
					<SegmentedControl
						options={providerOptions}
						value={settings.pulseProvider}
						onChange={handleProviderChange}
						ariaLabel={t("settings.pulseProvider")}
						disabled={updateMutation.isPending}
					/>
				</div>
				<FormRowSeparator />
				<SettingsToolRow
					label={t("settings.uptimeKuma")}
					desc={t("settings.kuma.configureDesc")}
					value={
						settings.pulseProvider === "kuma"
							? t("settings.active")
							: kumaConfigured
								? t("settings.configured")
								: undefined
					}
					valuePositive={kumaConfigured}
					onClick={() => navigate({ to: "/admin/settings/kuma" })}
				/>
				<FormRowSeparator />
				<SettingsToolRow
					label={t("settings.beszel.title")}
					desc={t("settings.beszel.configureDesc")}
					value={
						settings.pulseProvider === "beszel"
							? t("settings.active")
							: beszelConfigured
								? t("settings.configured")
								: undefined
					}
					valuePositive={beszelConfigured}
					onClick={() => navigate({ to: "/admin/settings/beszel" })}
				/>
			</FormSectionCard>

			<FormSectionHeader>{t("settings.bot.section")}</FormSectionHeader>
			<FormSectionCard>
				<SettingsToolRow
					label={t("settings.brandingRow")}
					desc={t("settings.brandingRowDesc")}
					value={settings.appName || undefined}
					onClick={() => navigate({ to: "/admin/settings/branding" })}
				/>
				<FormRowSeparator />
				<SettingsToolRow
					label={t("access.settingsRow")}
					desc={t("access.settingsRowDesc")}
					value={
						registration.data?.registrationMode === "invite_only"
							? t("access.inviteOnly")
							: registration.data?.registrationMode === "open"
								? t("access.open")
								: undefined
					}
					onClick={() => navigate({ to: "/admin/settings/access" })}
				/>
				<FormRowSeparator />
				<SettingsToolRow
					label={t("settings.bot.welcomeRow")}
					desc={t("settings.bot.welcomeRowDesc")}
					onClick={() => navigate({ to: "/admin/settings/welcome" })}
				/>
			</FormSectionCard>

			<FormSectionHeader>{t("settings.system")}</FormSectionHeader>
			<FormSectionCard>
				<FormRow label={t("settings.remnawave")}>
					<span
						style={{
							fontSize: 11,
							color: "var(--v2-text-positive)",
							fontFamily: "var(--font-mono)",
						}}
					>
						{settings.remnawaveVersion ? `v${settings.remnawaveVersion}` : "\u2014"}
					</span>
				</FormRow>
				<FormRowSeparator />
				<FormRow label={t("settings.flowvy")}>
					<span
						style={{
							fontSize: 12,
							color: "var(--v2-text-secondary)",
							fontFamily: "var(--font-mono)",
						}}
					>
						v{settings.flowvyVersion}
					</span>
				</FormRow>
			</FormSectionCard>
		</div>
	);
};
