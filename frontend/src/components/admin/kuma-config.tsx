import { ArrowLeft, Check } from "lucide-react";
/**
 * Kuma configuration sub-screen — URL, slug, connection test, save.
 */
import { type FC, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTestKuma, useUpdateSettings } from "../../hooks/use-admin-settings.ts";
import styles from "../../pages/admin/settings.module.css";
import type { AdminSettings } from "../../types/admin-settings.ts";
import { ActionBtn } from "../ui/action-btn.tsx";
import { ConfirmDialog } from "../ui/confirm-dialog.tsx";
import { InputField } from "../ui/input-field.tsx";

interface KumaConfigProps {
	settings: AdminSettings;
	onBack: () => void;
}

export const KumaConfig: FC<KumaConfigProps> = ({ settings, onBack }) => {
	const { t } = useTranslation();
	const [url, setUrl] = useState(settings.kumaUrl ?? "");
	const [slug, setSlug] = useState(settings.kumaSlug ?? "");
	const [saved, setSaved] = useState(false);
	const [showDiscard, setShowDiscard] = useState(false);

	const updateMutation = useUpdateSettings();
	const testMutation = useTestKuma();

	const initUrl = settings.kumaUrl ?? "";
	const initSlug = settings.kumaSlug ?? "";
	const dirty = url !== initUrl || slug !== initSlug;

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
			kumaUrl: url || null,
			kumaSlug: slug || null,
		});
		setSaved(true);
	};

	const connStatus = testMutation.data;
	const connColor = connStatus?.ok
		? "var(--v2-text-positive)"
		: connStatus?.error
			? "var(--v2-text-negative)"
			: "var(--v2-text-secondary)";
	const connText = connStatus?.ok
		? t('settings.kuma.connected')
		: connStatus?.error
			? connStatus.error
			: t('settings.kuma.notTested');

	return (
		<div className={styles.page}>
			<div className={styles.subHeader}>
				<button type="button" className={styles.backBtn} onClick={handleBack}>
					<ArrowLeft size={16} />
				</button>
				<h1 className={styles.headerTitle}>{t('settings.kuma.title')}</h1>
			</div>

			<div className={styles.sectionBody}>
				<div className={styles.inputRow}>
					<div className={styles.inputRowLabels}>
						<span className={styles.rowLabel}>{t('settings.kuma.urlLabel')}</span>
						<span className={styles.rowDesc}>{t('settings.kuma.urlDesc')}</span>
					</div>
					<InputField
						value={url}
						onChange={(v) => {
							setUrl(v);
							setSaved(false);
						}}
						placeholder={t('settings.kuma.urlPlaceholder')}
					/>
				</div>

				<div className={styles.inputRow}>
					<div className={styles.inputRowLabels}>
						<span className={styles.rowLabel}>{t('settings.kuma.slugLabel')}</span>
						<span className={styles.rowDesc}>{t('settings.kuma.slugDesc')}</span>
					</div>
					<InputField
						value={slug}
						onChange={(v) => {
							setSlug(v);
							setSaved(false);
						}}
						placeholder={t('settings.kuma.slugPlaceholder')}
					/>
				</div>

				<div className={styles.row}>
					<div className={styles.rowLeft}>
						<span className={styles.rowLabel}>{t('settings.kuma.statusLabel')}</span>
						<span className={styles.statusText} style={{ color: connColor }}>
							{connText}
						</span>
					</div>
					<ActionBtn
						onClick={() => testMutation.mutate()}
						loading={testMutation.isPending}
						variant="action"
						size="sm"
					>
						{t('settings.kuma.test')}
					</ActionBtn>
				</div>

				{(dirty || saved) && (
					<div className={styles.saveBar}>
						{saved && (
							<span className={styles.savedText}>
								<Check size={12} /> {t('settings.kuma.saved')}
							</span>
						)}
						{dirty && !saved && (
							<ActionBtn onClick={handleSave} loading={updateMutation.isPending} size="md">
								{t('settings.kuma.saveChanges')}
							</ActionBtn>
						)}
					</div>
				)}
			</div>

			<ConfirmDialog
				open={showDiscard}
				title={t('settings.kuma.discardTitle')}
				confirmLabel={t('settings.kuma.discardConfirm')}
				cancelLabel={t('settings.kuma.discardCancel')}
				onConfirm={onBack}
				onCancel={() => setShowDiscard(false)}
			>
				<p>{t('settings.kuma.discardBody')}</p>
			</ConfirmDialog>
		</div>
	);
};
