/** Admin Settings page — main list, sub-screens are separate routes. */
import { useNavigate } from "@tanstack/react-router";
import { Activity, MessageSquareText, Palette, ShieldCheck } from "lucide-react";
import type { FC } from "react";
import { useTranslation } from "react-i18next";
import {
	SettingsDivider,
	SettingsFactRow,
	SettingsNavRow,
	SettingsSection,
} from "../../components/admin/settings-surface.tsx";
import { ErrorState } from "../../components/ui/error-state.tsx";
import { InlineFeedback } from "../../components/ui/inline-feedback.tsx";
import { PageLoading } from "../../components/ui/page-loading.tsx";
import { SegmentedControl } from "../../components/ui/segmented-control.tsx";
import {
	BeszelIcon,
	FlowvyIcon,
	RemnawaveIcon,
	TributeIcon,
	UptimeKumaIcon,
} from "../../components/ui/service-brand-icon.tsx";
import { useAdminSettings, useUpdateSettings } from "../../hooks/use-admin-settings.ts";
import { useRegistrationSettings } from "../../hooks/use-registration-admin.ts";
import { formatMissing, formatVersion } from "../../lib/format.ts";
import type { PulseProvider } from "../../types/admin-settings.ts";
import styles from "./settings.module.css";

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
		return <ErrorState onAction={refetch} />;
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
			<SettingsSection title={t("settings.integrations")}>
				<div className={styles.providerRow}>
					<div className={styles.providerTitleRow}>
						<span className={styles.providerIcon} data-settings-icon="pulse" aria-hidden="true">
							<Activity size={16} strokeWidth={1.8} />
						</span>
						<div className={styles.providerHeading}>
							<span className={styles.providerLabel}>{t("settings.pulseProvider")}</span>
							<span className={styles.providerDescription}>{t("settings.integrationsHint")}</span>
						</div>
					</div>
					<SegmentedControl
						options={providerOptions}
						value={settings.pulseProvider}
						onChange={handleProviderChange}
						ariaLabel={t("settings.pulseProvider")}
						disabled={updateMutation.isPending}
					/>
				</div>
				<SettingsDivider />
				<SettingsNavRow
					icon={<UptimeKumaIcon size={17} />}
					label={t("settings.uptimeKuma")}
					description={t("settings.kuma.configureDesc")}
					value={
						settings.pulseProvider === "kuma"
							? t("settings.active")
							: kumaConfigured
								? t("settings.configured")
								: undefined
					}
					tone={kumaConfigured ? "positive" : "default"}
					onClick={() => navigate({ to: "/admin/settings/kuma" })}
				/>
				<SettingsDivider />
				<SettingsNavRow
					icon={<BeszelIcon size={17} />}
					label={t("settings.beszel.title")}
					description={t("settings.beszel.configureDesc")}
					value={
						settings.pulseProvider === "beszel"
							? t("settings.active")
							: beszelConfigured
								? t("settings.configured")
								: undefined
					}
					tone={beszelConfigured ? "positive" : "default"}
					onClick={() => navigate({ to: "/admin/settings/beszel" })}
				/>
			</SettingsSection>

			<SettingsSection title={t("settings.payments")}>
				<SettingsNavRow
					icon={<TributeIcon size={17} />}
					label={t("settings.tribute.title")}
					description={t("settings.tribute.configureDesc")}
					value={
						settings.tributeCredentialsConfigured
							? t("settings.tribute.keyAdded")
							: t("settings.tribute.setupRequired")
					}
					tone={settings.tributeCredentialsConfigured ? "positive" : "warning"}
					onClick={() => navigate({ to: "/admin/settings/tribute" })}
				/>
			</SettingsSection>

			<SettingsSection title={t("settings.miniApp.section")}>
				<SettingsNavRow
					icon={<Palette size={17} strokeWidth={1.8} aria-hidden="true" />}
					label={t("settings.brandingRow")}
					description={t("settings.brandingRowDesc")}
					value={settings.appName || undefined}
					onClick={() => navigate({ to: "/admin/settings/branding" })}
				/>
				<SettingsDivider />
				<SettingsNavRow
					icon={<ShieldCheck size={17} strokeWidth={1.8} aria-hidden="true" />}
					label={t("access.settingsRow")}
					description={t("access.settingsRowDesc")}
					value={
						registration.data?.registrationMode === "invite_only"
							? t("access.inviteOnly")
							: registration.data?.registrationMode === "open"
								? t("access.open")
								: undefined
					}
					onClick={() => navigate({ to: "/admin/settings/access" })}
				/>
				<SettingsDivider />
				<SettingsNavRow
					icon={<MessageSquareText size={17} strokeWidth={1.8} aria-hidden="true" />}
					label={t("settings.miniApp.welcomeRow")}
					description={t("settings.miniApp.welcomeRowDesc")}
					onClick={() => navigate({ to: "/admin/settings/welcome" })}
				/>
			</SettingsSection>

			<SettingsSection title={t("settings.system")}>
				<SettingsFactRow
					icon={<RemnawaveIcon size={16} />}
					label={t("settings.remnawave")}
					value={
						settings.remnawaveVersion ? formatVersion(settings.remnawaveVersion) : formatMissing()
					}
					tone={settings.remnawaveVersion ? "positive" : "default"}
				/>
				<SettingsDivider />
				<SettingsFactRow
					icon={<FlowvyIcon size={16} />}
					label={t("settings.flowvyVersion")}
					value={formatVersion(settings.flowvyVersion)}
				/>
			</SettingsSection>
		</div>
	);
};
