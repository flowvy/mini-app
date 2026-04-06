import { ChevronRight } from "lucide-react";
/**
 * Admin Settings page — three views: main, kuma config, quick links.
 */
import { type FC, useState } from "react";
import { KumaConfig } from "../../components/admin/kuma-config.tsx";
import { QuickLinks } from "../../components/admin/quick-links.tsx";
import { Toggle } from "../../components/ui/toggle.tsx";
import { useAdminSettings, useUpdateSettings } from "../../hooks/use-admin-settings.ts";
import styles from "./settings.module.css";

type View = "settings" | "kuma" | "links";

export const AdminSettings: FC = () => {
	const [view, setView] = useState<View>("settings");
	const { settings, isPending, error } = useAdminSettings();
	const updateMutation = useUpdateSettings();

	if (isPending || (!settings && !error)) {
		return (
			<div className={styles.page}>
				<div className={styles.header}>
					<h1 className={styles.headerTitle}>Settings</h1>
				</div>
				<p style={{ color: "var(--v2-text-secondary)", fontSize: 12 }}>Loading...</p>
			</div>
		);
	}

	if (error || !settings) {
		return (
			<div className={styles.page}>
				<div className={styles.header}>
					<h1 className={styles.headerTitle}>Settings</h1>
				</div>
				<p style={{ color: "var(--v2-text-negative)", fontSize: 12 }}>Failed to load settings</p>
			</div>
		);
	}

	if (view === "kuma") {
		return <KumaConfig settings={settings} onBack={() => setView("settings")} />;
	}
	if (view === "links") {
		return <QuickLinks settings={settings} onBack={() => setView("settings")} />;
	}

	const handleToggleKuma = (enabled: boolean) => {
		updateMutation.mutate({ kumaEnabled: enabled });
	};

	const kumaConfigured = settings.kumaUrl && settings.kumaSlug;

	return (
		<div className={styles.page}>
			<div className={styles.header}>
				<h1 className={styles.headerTitle}>Settings</h1>
			</div>

			{/* Integrations */}
			<div className={styles.sectionBody}>
				<div className={styles.sectionDivider}>Integrations</div>

				<div className={styles.row}>
					<div className={styles.rowLeft}>
						<span className={styles.rowLabel}>Uptime Kuma</span>
						<span className={styles.rowDesc}>Status page monitoring</span>
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
							<span className={styles.toolRowLabel}>Configure</span>
							<span className={styles.toolRowDesc}>URL, slug, connection test</span>
						</div>
						<span className={styles.toolRowRight}>
							{kumaConfigured && <span className={styles.rowValuePositive}>Configured</span>}
							<span className={styles.toolRowChevron}>
								<ChevronRight size={14} />
							</span>
						</span>
					</button>
				)}
			</div>

			{/* Quick Links */}
			<div className={`${styles.sectionBody} ${styles.sectionBodyGap}`}>
				<div className={styles.sectionDivider}>Quick Links</div>

				<button type="button" className={styles.toolRow} onClick={() => setView("links")}>
					<div className={styles.toolRowLeft}>
						<span className={styles.toolRowLabel}>Support & Renew</span>
						<span className={styles.toolRowDesc}>Links shown to users</span>
					</div>
					<span className={styles.toolRowChevron}>
						<ChevronRight size={14} />
					</span>
				</button>
			</div>

			{/* System */}
			<div className={`${styles.sectionBody} ${styles.sectionBodyGap}`}>
				<div className={styles.sectionDivider}>System</div>

				<div className={styles.row}>
					<div className={styles.rowLeft}>
						<span className={styles.rowLabel}>Remnawave</span>
						<span className={styles.rowDesc}>VPN panel</span>
					</div>
					<span className={styles.rowValuePositive}>
						{settings.remnawaveVersion ? `v${settings.remnawaveVersion}` : "\u2014"}
					</span>
				</div>

				<div className={styles.row}>
					<div className={styles.rowLeft}>
						<span className={styles.rowLabel}>Flowvy</span>
						<span className={styles.rowDesc}>Application version</span>
					</div>
					<span className={styles.rowValue}>v{settings.flowvyVersion}</span>
				</div>
			</div>
		</div>
	);
};
