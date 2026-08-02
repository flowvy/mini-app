import { useBlocker } from "@tanstack/react-router";
/** Branding sub-screen — app name, logo URL, save. */
import { ArrowLeft } from "lucide-react";
import { type FC, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUpdateSettings } from "../../hooks/use-admin-settings.ts";
import ss from "../../pages/admin/settings.module.css";
import type { AdminSettings } from "../../types/admin-settings.ts";
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
import { InlineFeedback } from "../ui/inline-feedback.tsx";

interface BrandingConfigProps {
	settings: AdminSettings;
	onBack: () => void;
}

export const BrandingConfig: FC<BrandingConfigProps> = ({ settings, onBack }) => {
	const { t } = useTranslation();
	const [appName, setAppName] = useState(settings.appName ?? "");
	const [logoUrl, setLogoUrl] = useState(settings.logoUrl ?? "");
	const [saved, setSaved] = useState(false);
	const [saveFailed, setSaveFailed] = useState(false);
	const backButtonRef = useRef<HTMLButtonElement>(null);

	const updateMutation = useUpdateSettings();

	const initAppName = settings.appName ?? "";
	const initLogoUrl = settings.logoUrl ?? "";
	const dirty = appName !== initAppName || logoUrl !== initLogoUrl;

	const blocker = useBlocker({
		shouldBlockFn: () => dirty,
		withResolver: true,
	});

	useEffect(() => {
		if (saved) {
			const timer = setTimeout(() => setSaved(false), 2000);
			return () => clearTimeout(timer);
		}
	}, [saved]);

	const handleSave = async () => {
		setSaveFailed(false);
		try {
			await updateMutation.mutateAsync({
				appName: appName || null,
				logoUrl: logoUrl || null,
			});
			setSaved(true);
		} catch {
			setSaveFailed(true);
		}
	};

	return (
		<div className={ss.page}>
			{saveFailed && <InlineFeedback>{t("settings.saveError")}</InlineFeedback>}
			<div className={ss.subHeader}>
				<button
					ref={backButtonRef}
					type="button"
					className={ss.backBtn}
					onClick={onBack}
					aria-label={t("common.back")}
				>
					<ArrowLeft size={16} />
				</button>
				<h1 className={ss.headerTitle}>{t("settings.branding.title")}</h1>
			</div>

			<FormSectionHeader>{t("settings.branding.identitySection")}</FormSectionHeader>
			<FormSectionCard>
				<FormRow label={t("settings.branding.appNameLabel")}>
					<FormInlineInput
						value={appName}
						onChange={(v) => {
							setAppName(v);
							setSaved(false);
						}}
						placeholder={t("settings.branding.appNamePlaceholder")}
					/>
				</FormRow>
				<FormRowSeparator />
				<FormRow label={t("settings.branding.logoUrlLabel")}>
					<FormInlineInput
						value={logoUrl}
						onChange={(v) => {
							setLogoUrl(v);
							setSaved(false);
						}}
						placeholder={t("settings.branding.logoUrlPlaceholder")}
						mono
					/>
				</FormRow>
			</FormSectionCard>
			<FormSectionFooter>{t("settings.branding.identityHint")}</FormSectionFooter>

			<FormSaveButton
				dirty={dirty && !saved}
				loading={updateMutation.isPending}
				onSave={handleSave}
			/>

			<ConfirmDialog
				open={blocker.status === "blocked"}
				returnFocusRef={backButtonRef}
				title={t("settings.branding.discardTitle")}
				confirmLabel={t("settings.branding.discardConfirm")}
				cancelLabel={t("settings.branding.discardCancel")}
				onConfirm={() => blocker.proceed?.()}
				onCancel={() => blocker.reset?.()}
			>
				<p>{t("settings.branding.discardBody")}</p>
			</ConfirmDialog>
		</div>
	);
};
