import { ArrowLeft } from "lucide-react";
/**
 * Kuma configuration sub-screen — URL, slug, connection test, save.
 */
import { type FC, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTestKuma, useUpdateSettings } from "../../hooks/use-admin-settings.ts";
import ss from "../../pages/admin/settings.module.css";
import type { AdminSettings } from "../../types/admin-settings.ts";
import { ActionBtn } from "../ui/action-btn.tsx";
import { ConfirmDialog } from "../ui/confirm-dialog.tsx";
import { FormSaveButton } from "../ui/form-save-button.tsx";
import {
	FormInlineInput,
	FormRow,
	FormRowSeparator,
	FormSectionCard,
	FormSectionFooter,
	FormSectionHeader,
} from "../ui/form-section.tsx";
import styles from "./kuma-config.module.css";

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
		? t("settings.kuma.connected")
		: connStatus?.error
			? connStatus.error
			: t("settings.kuma.notTested");

	return (
		<div className={ss.page}>
			<div className={ss.subHeader}>
				<button type="button" className={ss.backBtn} onClick={handleBack}>
					<ArrowLeft size={16} />
				</button>
				<h1 className={ss.headerTitle}>{t("settings.kuma.title")}</h1>
			</div>

			<FormSectionHeader>{t("settings.kuma.connectionSection")}</FormSectionHeader>
			<FormSectionCard>
				<FormRow label={t("settings.kuma.urlLabel")}>
					<FormInlineInput
						value={url}
						onChange={(v) => {
							setUrl(v);
							setSaved(false);
						}}
						placeholder={t("settings.kuma.urlPlaceholder")}
						mono
					/>
				</FormRow>
				<FormRowSeparator />
				<FormRow label={t("settings.kuma.slugLabel")}>
					<FormInlineInput
						value={slug}
						onChange={(v) => {
							setSlug(v);
							setSaved(false);
						}}
						placeholder={t("settings.kuma.slugPlaceholder")}
						mono
					/>
				</FormRow>
				<FormRowSeparator />
				<FormRow label={t("settings.kuma.statusLabel")}>
					<span className={styles.statusText} style={{ color: connColor }}>
						{connText}
					</span>
					<ActionBtn
						onClick={() => testMutation.mutate()}
						loading={testMutation.isPending}
						variant="action"
						size="sm"
					>
						{t("settings.kuma.test")}
					</ActionBtn>
				</FormRow>
			</FormSectionCard>
			<FormSectionFooter>{t("settings.kuma.connectionHint")}</FormSectionFooter>

			<FormSaveButton
				dirty={dirty && !saved}
				loading={updateMutation.isPending}
				onSave={handleSave}
			/>

			<ConfirmDialog
				open={showDiscard}
				title={t("settings.kuma.discardTitle")}
				confirmLabel={t("settings.kuma.discardConfirm")}
				cancelLabel={t("settings.kuma.discardCancel")}
				onConfirm={onBack}
				onCancel={() => setShowDiscard(false)}
			>
				<p>{t("settings.kuma.discardBody")}</p>
			</ConfirmDialog>
		</div>
	);
};
