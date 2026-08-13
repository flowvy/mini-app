import { useBlocker } from "@tanstack/react-router";
/** Branding sub-screen — app name, logo URL, save. */
import { type FC, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUpdateSettings } from "../../hooks/use-admin-settings.ts";
import ss from "../../pages/admin/settings.module.css";
import type { AdminSettings } from "../../types/admin-settings.ts";
import { ConfirmDialog } from "../ui/confirm-dialog.tsx";
import { FormSaveButton } from "../ui/form-save-button.tsx";
import { FormField, FormFieldInput } from "../ui/form-section.tsx";
import { InlineFeedback } from "../ui/inline-feedback.tsx";
import { SettingsFields, SettingsPanel } from "./settings-surface.tsx";

interface BrandingConfigProps {
	settings: AdminSettings;
}

export const BrandingConfig: FC<BrandingConfigProps> = ({ settings }) => {
	const { t } = useTranslation();
	const [appName, setAppName] = useState(settings.appName ?? "");
	const [logoUrl, setLogoUrl] = useState(settings.logoUrl ?? "");
	const [saved, setSaved] = useState(false);
	const [saveFailed, setSaveFailed] = useState(false);
	const updateMutation = useUpdateSettings();

	const initAppName = settings.appName ?? "";
	const initLogoUrl = settings.logoUrl ?? "";
	const dirty = appName !== initAppName || logoUrl !== initLogoUrl;

	const blocker = useBlocker({
		shouldBlockFn: () => dirty && !saved,
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
		<div className={ss.formPage}>
			{saveFailed && <InlineFeedback>{t("settings.saveError")}</InlineFeedback>}
			<SettingsPanel title={t("settings.branding.identitySection")}>
				<SettingsFields>
					<FormField label={t("settings.branding.appNameLabel")} htmlFor="branding-app-name">
						<FormFieldInput
							id="branding-app-name"
							value={appName}
							onChange={(event) => {
								setAppName(event.target.value);
								setSaved(false);
							}}
							placeholder={t("settings.branding.appNamePlaceholder")}
							maxLength={80}
						/>
					</FormField>
					<FormField
						label={t("settings.branding.logoUrlLabel")}
						htmlFor="branding-logo-url"
						hint={t("settings.branding.identityHint")}
					>
						<FormFieldInput
							id="branding-logo-url"
							type="url"
							inputMode="url"
							value={logoUrl}
							onChange={(event) => {
								setLogoUrl(event.target.value);
								setSaved(false);
							}}
							placeholder={t("settings.branding.logoUrlPlaceholder")}
							autoCapitalize="none"
							autoCorrect="off"
							spellCheck={false}
						/>
					</FormField>
				</SettingsFields>
			</SettingsPanel>

			<FormSaveButton
				dirty={dirty && !saved}
				loading={updateMutation.isPending}
				onSave={handleSave}
			/>

			<ConfirmDialog
				open={blocker.status === "blocked"}
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
