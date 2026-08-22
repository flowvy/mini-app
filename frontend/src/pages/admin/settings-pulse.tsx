import { useNavigate } from "@tanstack/react-router";
import type { FC } from "react";
import { useTranslation } from "react-i18next";
import {
	SettingsChoiceRow,
	SettingsDivider,
	SettingsNavRow,
	SettingsPanel,
} from "../../components/admin/settings-surface.tsx";
import { ErrorState } from "../../components/ui/error-state.tsx";
import { InlineFeedback } from "../../components/ui/inline-feedback.tsx";
import { PageLoading } from "../../components/ui/page-loading.tsx";
import { BeszelIcon, UptimeKumaIcon } from "../../components/ui/service-brand-icon.tsx";
import { useAdminSettings, useUpdateSettings } from "../../hooks/use-admin-settings.ts";
import type { PulseProvider } from "../../types/admin-settings.ts";
import styles from "./settings.module.css";

export const AdminPulseSettings: FC = () => {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const { settings, isPending, error, refetch } = useAdminSettings();
	const update = useUpdateSettings();

	if (isPending || (!settings && !error)) return <PageLoading />;
	if (error || !settings) return <ErrorState onAction={refetch} />;

	const kumaConfigured = Boolean(settings.kumaUrl && settings.kumaSlug);
	const beszelConfigured = Boolean(settings.beszelUrl && settings.beszelCredentialsConfigured);
	const chooseSource = (provider: PulseProvider) => {
		if (provider === settings.pulseProvider) return;
		update.reset();
		update.mutate({ pulseProvider: provider });
	};

	return (
		<div className={styles.formPage}>
			<p className={styles.screenIntro}>{t("settings.pulse.intro")}</p>
			{update.isError && (
				<InlineFeedback attention="action">{t("settings.saveError")}</InlineFeedback>
			)}
			<SettingsPanel title={t("settings.pulse.activeSource")}>
				<div role="radiogroup" aria-label={t("settings.pulseProvider")}>
					<SettingsChoiceRow
						name="pulse-source"
						value="disabled"
						checked={settings.pulseProvider === "disabled"}
						label={t("settings.providerDisabled")}
						description={t("settings.pulse.offDescription")}
						selectedLabel={t("settings.active")}
						disabled={update.isPending}
						onChange={() => chooseSource("disabled")}
					/>
					{(kumaConfigured || settings.pulseProvider === "kuma") && (
						<>
							<SettingsDivider />
							<SettingsChoiceRow
								name="pulse-source"
								value="kuma"
								checked={settings.pulseProvider === "kuma"}
								label={t("settings.uptimeKuma")}
								description={t("settings.kuma.configureDesc")}
								selectedLabel={t("settings.active")}
								disabled={update.isPending}
								onChange={() => chooseSource("kuma")}
							/>
						</>
					)}
					{(beszelConfigured || settings.pulseProvider === "beszel") && (
						<>
							<SettingsDivider />
							<SettingsChoiceRow
								name="pulse-source"
								value="beszel"
								checked={settings.pulseProvider === "beszel"}
								label={t("settings.beszel.title")}
								description={t("settings.beszel.configureDesc")}
								selectedLabel={t("settings.active")}
								disabled={update.isPending}
								onChange={() => chooseSource("beszel")}
							/>
						</>
					)}
				</div>
			</SettingsPanel>

			<SettingsPanel title={t("settings.pulse.connections")}>
				<SettingsNavRow
					icon={<UptimeKumaIcon size={17} />}
					label={t("settings.uptimeKuma")}
					description={t("settings.kuma.configureDesc")}
					value={kumaConfigured ? t("settings.configured") : t("settings.pulse.setUp")}
					tone={kumaConfigured ? "positive" : "default"}
					onClick={() => navigate({ to: "/admin/settings/kuma" })}
				/>
				<SettingsDivider />
				<SettingsNavRow
					icon={<BeszelIcon size={17} />}
					label={t("settings.beszel.title")}
					description={t("settings.beszel.configureDesc")}
					value={beszelConfigured ? t("settings.configured") : t("settings.pulse.setUp")}
					tone={beszelConfigured ? "positive" : "default"}
					onClick={() => navigate({ to: "/admin/settings/beszel" })}
				/>
			</SettingsPanel>
		</div>
	);
};
