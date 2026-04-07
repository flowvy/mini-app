import { ChevronRight, Settings } from "lucide-react";
/**
 * Admin Settings page — four views: main, kuma config, quick links, branding.
 */
import { type FC, useState } from "react";
import { useTranslation } from "react-i18next";
import { BrandingConfig } from "../../components/admin/branding-config.tsx";
import { KumaConfig } from "../../components/admin/kuma-config.tsx";
import { QuickLinks } from "../../components/admin/quick-links.tsx";
import { Toggle } from "../../components/ui/toggle.tsx";
import { useAdminSettings, useUpdateSettings } from "../../hooks/use-admin-settings.ts";
import styles from "./settings.module.css";

type View = "settings" | "kuma" | "links" | "branding";

export const AdminSettings: FC = () => {
	const { t } = useTranslation();
	const [view, setView] = useState<View>("settings");
	const { settings, isPending, error } = useAdminSettings();
	const updateMutation = useUpdateSettings();

	if (isPending || (!settings && !error)) {
		return (
			<div className={styles.page}>
				<div className={styles.header}>
					<Settings size={16} className={styles.headerIcon} />
					<h1 className={styles.headerTitle}>{t("settings.title")}</h1>
				</div>
				<p style={{ color: "var(--v2-text-secondary)", fontSize: 12 }}>{t("settings.loading")}</p>
			</div>
		);
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

			{/* Integrations */}
			<div className={styles.sectionBody}>
				<div className={styles.sectionDivider}>{t("settings.integrations")}</div>

				<div className={styles.row}>
					<div className={styles.rowLeft}>
						<span className={styles.rowLabel}>{t("settings.uptimeKuma")}</span>
						<span className={styles.rowDesc}>{t("settings.uptimeKumaDesc")}</span>
					</div>
					<Toggle
						checked={settings.kumaEnabled}
						onChange={handleToggleKuma}
						disabled={updateMutation.isPending}
					/>
				</div>

				{settings.kumaEnabled && (
					<button type="button" className={styles.toolRow} onClick={() => setView("kuma")}>
						<div className={styles.toolRowLeft}>
							<span className={styles.toolRowLabel}>{t("settings.configure")}</span>
							<span className={styles.toolRowDesc}>{t("settings.configureDesc")}</span>
						</div>
						<span className={styles.toolRowRight}>
							{kumaConfigured && (
								<span className={styles.rowValuePositive}>{t("settings.configured")}</span>
							)}
							<span className={styles.toolRowChevron}>
								<ChevronRight size={14} />
							</span>
						</span>
					</button>
				)}
			</div>

			{/* Quick Links */}
			<div className={`${styles.sectionBody} ${styles.sectionBodyGap}`}>
				<div className={styles.sectionDivider}>{t("settings.quickLinksSection")}</div>

				<button type="button" className={styles.toolRow} onClick={() => setView("links")}>
					<div className={styles.toolRowLeft}>
						<span className={styles.toolRowLabel}>{t("settings.supportAndRenew")}</span>
						<span className={styles.toolRowDesc}>{t("settings.supportAndRenewDesc")}</span>
					</div>
					<span className={styles.toolRowChevron}>
						<ChevronRight size={14} />
					</span>
				</button>
			</div>

			{/* Branding */}
			<div className={`${styles.sectionBody} ${styles.sectionBodyGap}`}>
				<div className={styles.sectionDivider}>{t("settings.brandingSection")}</div>

				<button type="button" className={styles.toolRow} onClick={() => setView("branding")}>
					<div className={styles.toolRowLeft}>
						<span className={styles.toolRowLabel}>{t("settings.brandingRow")}</span>
						<span className={styles.toolRowDesc}>{t("settings.brandingRowDesc")}</span>
					</div>
					<span className={styles.toolRowRight}>
						{settings.appName && <span className={styles.rowValue}>{settings.appName}</span>}
						<span className={styles.toolRowChevron}>
							<ChevronRight size={14} />
						</span>
					</span>
				</button>
			</div>

			{/* System */}
			<div className={`${styles.sectionBody} ${styles.sectionBodyGap}`}>
				<div className={styles.sectionDivider}>{t("settings.system")}</div>

				<div className={styles.row}>
					<div className={styles.rowLeft}>
						<span className={styles.rowLabel}>{t("settings.remnawave")}</span>
						<span className={styles.rowDesc}>{t("settings.remnawaveDesc")}</span>
					</div>
					<span className={styles.rowValuePositive}>
						{settings.remnawaveVersion ? `v${settings.remnawaveVersion}` : "\u2014"}
					</span>
				</div>

				<div className={styles.row}>
					<div className={styles.rowLeft}>
						<span className={styles.rowLabel}>{t("settings.flowvy")}</span>
						<span className={styles.rowDesc}>{t("settings.flowvyDesc")}</span>
					</div>
					<span className={styles.rowValue}>v{settings.flowvyVersion}</span>
				</div>
			</div>
		</div>
	);
};
