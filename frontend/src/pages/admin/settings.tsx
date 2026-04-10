/** Admin Settings page — five views: main, kuma config, quick links, branding, welcome. */
import { ChevronRight, Settings } from "lucide-react";
import { type FC, useState } from "react";
import { useTranslation } from "react-i18next";
import { BrandingConfig } from "../../components/admin/branding-config.tsx";
import { KumaConfig } from "../../components/admin/kuma-config.tsx";
import { QuickLinks } from "../../components/admin/quick-links.tsx";
import { WelcomeConfig } from "../../components/admin/welcome-config.tsx";
import {
	FormRow,
	FormRowSeparator,
	FormSectionCard,
	FormSectionFooter,
	FormSectionHeader,
} from "../../components/ui/form-section.tsx";
import { PageLoading } from "../../components/ui/page-loading.tsx";
import { Toggle } from "../../components/ui/toggle.tsx";
import { useAdminSettings, useUpdateSettings } from "../../hooks/use-admin-settings.ts";
import styles from "./settings.module.css";

type View = "settings" | "kuma" | "links" | "branding" | "welcome";

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
	const [view, setView] = useState<View>("settings");
	const { settings, isPending, error } = useAdminSettings();
	const updateMutation = useUpdateSettings();

	if (isPending || (!settings && !error)) {
		return <PageLoading />;
	}

	if (error || !settings) {
		return (
			<div className={styles.page}>
				<div className={styles.header}>
					<Settings size={16} className={styles.headerIcon} />
					<h1 className={styles.headerTitle}>{t("settings.title")}</h1>
				</div>
				<p style={{ color: "var(--v2-text-negative)", fontSize: 12 }}>{t("settings.error")}</p>
			</div>
		);
	}

	if (view === "kuma") {
		return <KumaConfig settings={settings} onBack={() => setView("settings")} />;
	}
	if (view === "links") {
		return <QuickLinks settings={settings} onBack={() => setView("settings")} />;
	}
	if (view === "branding") {
		return <BrandingConfig settings={settings} onBack={() => setView("settings")} />;
	}
	if (view === "welcome") {
		return <WelcomeConfig settings={settings} onBack={() => setView("settings")} />;
	}

	const handleToggleKuma = (enabled: boolean) => {
		updateMutation.mutate({ kumaEnabled: enabled });
	};

	const kumaConfigured = settings.kumaUrl && settings.kumaSlug;

	return (
		<div className={styles.page}>
			<div className={styles.header}>
				<Settings size={16} className={styles.headerIcon} />
				<h1 className={styles.headerTitle}>{t("settings.title")}</h1>
			</div>

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
							onClick={() => setView("kuma")}
						/>
					</>
				)}
			</FormSectionCard>
			<FormSectionFooter>{t("settings.integrationsHint")}</FormSectionFooter>

			<FormSectionHeader>{t("settings.quickLinksSection")}</FormSectionHeader>
			<FormSectionCard>
				<SettingsToolRow
					label={t("settings.supportAndRenew")}
					desc={t("settings.supportAndRenewDesc")}
					onClick={() => setView("links")}
				/>
			</FormSectionCard>

			<FormSectionHeader>{t("settings.brandingSection")}</FormSectionHeader>
			<FormSectionCard>
				<SettingsToolRow
					label={t("settings.brandingRow")}
					desc={t("settings.brandingRowDesc")}
					value={settings.appName || undefined}
					onClick={() => setView("branding")}
				/>
			</FormSectionCard>

			<FormSectionHeader>{t("settings.bot.section")}</FormSectionHeader>
			<FormSectionCard>
				<SettingsToolRow
					label={t("settings.bot.welcomeRow")}
					desc={t("settings.bot.welcomeRowDesc")}
					onClick={() => setView("welcome")}
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
