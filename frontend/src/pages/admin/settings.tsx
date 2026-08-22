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
import { ActionBtn } from "../../components/ui/action-btn.tsx";
import { ErrorState } from "../../components/ui/error-state.tsx";
import { InlineFeedback } from "../../components/ui/inline-feedback.tsx";
import { PageLoading } from "../../components/ui/page-loading.tsx";
import { FlowvyIcon, RemnawaveIcon, TributeIcon } from "../../components/ui/service-brand-icon.tsx";
import { useAdminSettings } from "../../hooks/use-admin-settings.ts";
import { useRegistrationSettings } from "../../hooks/use-registration-admin.ts";
import { formatMissing, formatVersion } from "../../lib/format.ts";
import styles from "./settings.module.css";

export const AdminSettings: FC = () => {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const { settings, isPending, error, refetch } = useAdminSettings();
	const registration = useRegistrationSettings();

	if (isPending || (!settings && !error)) {
		return <PageLoading />;
	}

	if (error || !settings) {
		return <ErrorState onAction={refetch} />;
	}

	const pulseValue =
		settings.pulseProvider === "disabled"
			? t("settings.providerDisabled")
			: settings.pulseProvider === "kuma"
				? t("settings.providerKuma")
				: t("settings.providerBeszel");

	return (
		<div className={styles.page}>
			<SettingsSection title={t("settings.integrations")}>
				<SettingsNavRow
					icon={<Activity size={17} strokeWidth={1.8} aria-hidden="true" />}
					label={t("settings.pulse.title")}
					description={t("settings.pulse.description")}
					value={pulseValue}
					tone={settings.pulseProvider === "disabled" ? "default" : "positive"}
					onClick={() => navigate({ to: "/admin/settings/pulse" })}
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
				{registration.isError && (
					<div className={styles.relatedLoadError}>
						<InlineFeedback>{t("access.settingsLoadError")}</InlineFeedback>
						<ActionBtn variant="action" size="sm" onClick={() => void registration.refetch()}>
							{t("common.retry")}
						</ActionBtn>
					</div>
				)}
				<SettingsDivider />
				<SettingsNavRow
					icon={<MessageSquareText size={17} strokeWidth={1.8} aria-hidden="true" />}
					label={t("settings.communication.title")}
					description={t("settings.communication.description")}
					value={t("settings.communication.messageCount", { count: 8 })}
					onClick={() => navigate({ to: "/admin/settings/communication" })}
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
