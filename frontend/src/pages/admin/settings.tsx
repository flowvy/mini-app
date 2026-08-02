/** Admin Settings page — main list, sub-screens are separate routes. */
import { useNavigate } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type { FC } from "react";
import { useTranslation } from "react-i18next";
import {
	FormRow,
	FormRowSeparator,
	FormSectionCard,
	FormSectionFooter,
	FormSectionHeader,
} from "../../components/ui/form-section.tsx";
import { InlineFeedback } from "../../components/ui/inline-feedback.tsx";
import { PageLoading } from "../../components/ui/page-loading.tsx";
import { Toggle } from "../../components/ui/toggle.tsx";
import { useAdminSettings, useUpdateSettings } from "../../hooks/use-admin-settings.ts";
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
	const { settings, isPending, error } = useAdminSettings();
	const updateMutation = useUpdateSettings();

	if (isPending || (!settings && !error)) {
		return <PageLoading />;
	}

	if (error || !settings) {
		return (
			<div className={styles.page}>
				<p style={{ color: "var(--v2-text-negative)", fontSize: 12 }}>{t("settings.error")}</p>
			</div>
		);
	}

	const handleToggleKuma = (enabled: boolean) => {
		updateMutation.reset();
		updateMutation.mutate({ kumaEnabled: enabled });
	};

	const kumaConfigured = settings.kumaUrl && settings.kumaSlug;

	return (
		<div className={styles.page}>
			{updateMutation.isError && <InlineFeedback>{t("settings.saveError")}</InlineFeedback>}
			<FormSectionHeader>{t("settings.integrations")}</FormSectionHeader>
			<FormSectionCard>
				<FormRow label={t("settings.uptimeKuma")}>
					<Toggle
						checked={settings.kumaEnabled}
						onChange={handleToggleKuma}
						disabled={updateMutation.isPending}
					/>
				</FormRow>
				{settings.kumaEnabled && (
					<>
						<FormRowSeparator />
						<SettingsToolRow
							label={t("settings.configure")}
							desc={t("settings.configureDesc")}
							value={kumaConfigured ? t("settings.configured") : undefined}
							valuePositive={!!kumaConfigured}
							onClick={() => navigate({ to: "/admin/settings/kuma" })}
						/>
					</>
				)}
			</FormSectionCard>
			<FormSectionFooter>{t("settings.integrationsHint")}</FormSectionFooter>

			<FormSectionHeader>{t("settings.brandingSection")}</FormSectionHeader>
			<FormSectionCard>
				<SettingsToolRow
					label={t("settings.brandingRow")}
					desc={t("settings.brandingRowDesc")}
					value={settings.appName || undefined}
					onClick={() => navigate({ to: "/admin/settings/branding" })}
				/>
			</FormSectionCard>

			<FormSectionHeader>{t("settings.bot.section")}</FormSectionHeader>
			<FormSectionCard>
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
