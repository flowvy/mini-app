import { ArrowLeft, Check } from "lucide-react";
/**
 * Branding sub-screen — app name, logo URL, save.
 */
import { type FC, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUpdateSettings } from "../../hooks/use-admin-settings.ts";
import styles from "../../pages/admin/settings.module.css";
import type { AdminSettings } from "../../types/admin-settings.ts";
import { ActionBtn } from "../ui/action-btn.tsx";
import { ConfirmDialog } from "../ui/confirm-dialog.tsx";
import { InputField } from "../ui/input-field.tsx";

interface BrandingConfigProps {
	settings: AdminSettings;
	onBack: () => void;
}

export const BrandingConfig: FC<BrandingConfigProps> = ({ settings, onBack }) => {
	const { t } = useTranslation();
	const [appName, setAppName] = useState(settings.appName ?? "");
	const [logoUrl, setLogoUrl] = useState(settings.logoUrl ?? "");
	const [saved, setSaved] = useState(false);
	const [showDiscard, setShowDiscard] = useState(false);

	const updateMutation = useUpdateSettings();

	const initAppName = settings.appName ?? "";
	const initLogoUrl = settings.logoUrl ?? "";
	const dirty = appName !== initAppName || logoUrl !== initLogoUrl;

	useEffect(() => {
		if (saved) {
			const timer = setTimeout(() => setSaved(false), 2000);
			return () => clearTimeout(timer);
		}
	}, [saved]);

	const handleBack = useCallback(() => {
		if (dirty) {
			setShowDiscard(true);
		} else {
			onBack();
		}
	}, [dirty, onBack]);

	const handleSave = async () => {
		await updateMutation.mutateAsync({
			appName: appName || null,
			logoUrl: logoUrl || null,
		});
		setSaved(true);
	};

	return (
		<div className={styles.page}>
			<div className={styles.subHeader}>
				<button type="button" className={styles.backBtn} onClick={handleBack}>
					<ArrowLeft size={16} />
				</button>
				<h1 className={styles.headerTitle}>{t("settings.branding.title")}</h1>
			</div>

			<div className={styles.sectionBody}>
				<div className={styles.inputRow}>
					<div className={styles.inputRowLabels}>
						<span className={styles.rowLabel}>{t("settings.branding.appNameLabel")}</span>
						<span className={styles.rowDesc}>{t("settings.branding.appNameDesc")}</span>
					</div>
					<InputField
						value={appName}
						onChange={(v) => {
							setAppName(v);
							setSaved(false);
						}}
						placeholder={t("settings.branding.appNamePlaceholder")}
					/>
				</div>

				<div className={styles.inputRow}>
					<div className={styles.inputRowLabels}>
						<span className={styles.rowLabel}>{t("settings.branding.logoUrlLabel")}</span>
						<span className={styles.rowDesc}>{t("settings.branding.logoUrlDesc")}</span>
					</div>
					<InputField
						value={logoUrl}
						onChange={(v) => {
							setLogoUrl(v);
							setSaved(false);
						}}
						placeholder={t("settings.branding.logoUrlPlaceholder")}
					/>
				</div>

				{(dirty || saved) && (
					<div className={styles.saveBar}>
						{saved && (
							<span className={styles.savedText}>
								<Check size={12} /> {t("settings.branding.saved")}
							</span>
						)}
						{dirty && !saved && (
							<ActionBtn onClick={handleSave} loading={updateMutation.isPending} size="md">
								{t("settings.branding.save")}
							</ActionBtn>
						)}
					</div>
				)}
			</div>

			<ConfirmDialog
				open={showDiscard}
				title={t("settings.branding.discardTitle")}
				confirmLabel={t("settings.branding.discardConfirm")}
				cancelLabel={t("settings.branding.discardCancel")}
				onConfirm={onBack}
				onCancel={() => setShowDiscard(false)}
			>
				<p>{t("settings.branding.discardBody")}</p>
			</ConfirmDialog>
		</div>
	);
};
