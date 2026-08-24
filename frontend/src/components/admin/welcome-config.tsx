import { useBlocker } from "@tanstack/react-router";
/** Welcome Message sub-screen — text, media file upload, button text, save. */
import { BadgeInfo } from "lucide-react";
import { type FC, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUpdateSettings } from "../../hooks/use-admin-settings.ts";
import { SUPPORTED_LOCALES, localeLabel } from "../../i18n";
import { apiUploadFile } from "../../lib/api.ts";
import { isMockAuth } from "../../lib/runtime.ts";
import ss from "../../pages/admin/settings.module.css";
import type { AdminSettings, WelcomeMediaUpload } from "../../types/admin-settings.ts";
import { TelegramHtmlEditor } from "../content/telegram-html-editor.tsx";
import { TemplateVariables } from "../content/template-variables.tsx";
import { ConfirmDialog } from "../ui/confirm-dialog.tsx";
import { FormSaveButton } from "../ui/form-save-button.tsx";
import { FormField, FormFieldInput } from "../ui/form-section.tsx";
import { InlineFeedback } from "../ui/inline-feedback.tsx";
import { SegmentedControl } from "../ui/segmented-control.tsx";
import { SettingsFields, SettingsInlineNotice, SettingsPanel } from "./settings-surface.tsx";
import { WelcomeMediaRow } from "./welcome-media-row.tsx";

const prefix = isMockAuth ? "/debug/admin/settings" : "/admin/settings";

interface WelcomeConfigProps {
	settings: AdminSettings;
}

function welcomeContentLocalesFrom(settings: AdminSettings) {
	const locales = structuredClone(settings.contentLocales);
	const defaultContent = locales[settings.contentDefaultLocale] ?? {};
	locales[settings.contentDefaultLocale] = {
		...defaultContent,
		welcomeText: defaultContent.welcomeText ?? settings.welcomeText,
		welcomeButtonText: defaultContent.welcomeButtonText ?? settings.welcomeButtonText,
	};
	return locales;
}

export const WelcomeConfig: FC<WelcomeConfigProps> = ({ settings }) => {
	const { t, i18n } = useTranslation();
	const [initialContentLocales, setInitialContentLocales] = useState(() =>
		welcomeContentLocalesFrom(settings),
	);
	const [contentLocales, setContentLocales] = useState(() =>
		structuredClone(initialContentLocales),
	);
	const [locale, setLocale] = useState(
		SUPPORTED_LOCALES.includes(settings.contentDefaultLocale)
			? settings.contentDefaultLocale
			: (SUPPORTED_LOCALES[0] ?? "en"),
	);
	const [mediaFileId, setMediaFileId] = useState(settings.welcomeMediaFileId);
	const [mediaFileName, setMediaFileName] = useState(settings.welcomeMediaFileName);
	const [mediaType, setMediaType] = useState(settings.welcomeMediaType);
	const [uploading, setUploading] = useState(false);
	const [feedbackError, setFeedbackError] = useState<string | null>(null);
	const updateMutation = useUpdateSettings();

	const content = contentLocales[locale] ?? {};
	const text = content.welcomeText ?? "";
	const buttonText = content.welcomeButtonText ?? "";
	const textDirty = JSON.stringify(contentLocales) !== JSON.stringify(initialContentLocales);
	const mediaDirty =
		mediaFileId !== settings.welcomeMediaFileId ||
		mediaFileName !== settings.welcomeMediaFileName ||
		mediaType !== settings.welcomeMediaType;
	const dirty = textDirty || mediaDirty;
	const updateContent = (field: "welcomeText" | "welcomeButtonText", value: string) => {
		setContentLocales((current) => ({
			...current,
			[locale]: { ...current[locale], [field]: value || null },
		}));
	};

	const blocker = useBlocker({
		shouldBlockFn: () => dirty,
		enableBeforeUnload: dirty,
		withResolver: true,
	});

	const isDefault = mediaFileId === null && settings.welcomeMediaUrl === null;
	const displayName = mediaFileId
		? (mediaFileName ?? t("settings.welcome.mediaCustomName"))
		: (settings.welcomeMediaUrl ?? t("settings.welcome.mediaDefaultName"));
	const displayType = mediaType ?? "animation";
	const mediaDescription =
		isDefault && !mediaDirty
			? t("settings.welcome.mediaHint")
			: displayType === "photo"
				? t("settings.welcome.mediaType.photo")
				: t("settings.welcome.mediaType.animation");

	const handleSave = async () => {
		setFeedbackError(null);
		const submittedContentLocales = contentLocales;
		const submittedMediaFileId = mediaFileId;
		const submittedMediaFileName = mediaFileName;
		const submittedMediaType = mediaType;
		try {
			const updated = await updateMutation.mutateAsync({
				contentLocales: submittedContentLocales,
				welcomeMediaFileId: submittedMediaFileId,
				welcomeMediaFileName: submittedMediaFileName,
				welcomeMediaType: submittedMediaType,
				welcomeMediaUrl: submittedMediaFileId ? null : undefined,
			});
			const savedContentLocales = welcomeContentLocalesFrom(updated);
			setInitialContentLocales(savedContentLocales);
			setContentLocales((current) =>
				current === submittedContentLocales ? structuredClone(savedContentLocales) : current,
			);
			setMediaFileId((current) =>
				current === submittedMediaFileId ? updated.welcomeMediaFileId : current,
			);
			setMediaFileName((current) =>
				current === submittedMediaFileName ? updated.welcomeMediaFileName : current,
			);
			setMediaType((current) =>
				current === submittedMediaType ? updated.welcomeMediaType : current,
			);
		} catch {
			setFeedbackError(t("settings.saveError"));
		}
	};

	const handlePickFile = async (file: File) => {
		setFeedbackError(null);
		setUploading(true);
		try {
			const result = await apiUploadFile<WelcomeMediaUpload>(`${prefix}/welcome-media`, file);
			setMediaFileId(result.fileId);
			setMediaFileName(result.fileName);
			setMediaType(result.mediaType);
		} catch {
			setFeedbackError(t("settings.welcome.mediaUploadError"));
		} finally {
			setUploading(false);
		}
	};

	const handleReset = () => {
		setFeedbackError(null);
		setMediaFileId(null);
		setMediaFileName(null);
		setMediaType(null);
	};

	return (
		<div className={ss.formPage}>
			{feedbackError && <InlineFeedback attention="action">{feedbackError}</InlineFeedback>}
			<SettingsPanel title={t("settings.welcome.contentSection")}>
				<SettingsFields>
					<FormField label={t("settings.content.languageLabel")}>
						<SegmentedControl
							options={SUPPORTED_LOCALES.map((key) => ({
								key,
								label: localeLabel(key, i18n.language),
							}))}
							value={locale}
							onChange={setLocale}
							ariaLabel={t("settings.content.languageLabel")}
						/>
					</FormField>
					<FormField
						label={t("settings.welcome.messageLabel")}
						htmlFor="welcome-message"
						notice={
							<SettingsInlineNotice
								icon={<BadgeInfo size={13} aria-hidden="true" />}
								tone="warning"
							>
								{t("settings.welcome.premiumWarning")}
							</SettingsInlineNotice>
						}
					>
						<TelegramHtmlEditor
							id="welcome-message"
							ariaLabel={t("settings.welcome.messageLabel")}
							value={text}
							onChange={(value) => updateContent("welcomeText", value)}
							placeholder={t("settings.welcome.messagePlaceholder")}
							maxLength={4_000}
						/>
					</FormField>
					<FormField label={t("settings.welcome.mediaSection")}>
						<WelcomeMediaRow
							fileName={displayName}
							mediaType={displayType}
							description={mediaDescription}
							isDefault={isDefault && !mediaDirty}
							uploading={uploading}
							onPickFile={handlePickFile}
							onReset={handleReset}
						/>
					</FormField>
					<FormField
						label={t("settings.welcome.buttonTextLabel")}
						htmlFor="welcome-button-text"
						hint={t("settings.welcome.buttonHint")}
					>
						<FormFieldInput
							id="welcome-button-text"
							value={buttonText}
							enterKeyHint="done"
							onChange={(event) => updateContent("welcomeButtonText", event.target.value)}
							placeholder={t("settings.welcome.buttonTextPlaceholder")}
						/>
					</FormField>
					<TemplateVariables
						variables={[
							...new Set([
								...(settings.contentTemplateVariables.welcomeText ?? []),
								...(settings.contentTemplateVariables.welcomeButtonText ?? []),
							]),
						]}
						scopes={{
							appName: [t("settings.welcome.messageLabel"), t("settings.welcome.buttonTextLabel")],
						}}
					/>
				</SettingsFields>
			</SettingsPanel>

			<FormSaveButton
				dirty={dirty}
				loading={updateMutation.isPending}
				onSave={handleSave}
				telegramMainButton
				telegramMainButtonVisible={blocker.status !== "blocked"}
			/>

			<ConfirmDialog
				open={blocker.status === "blocked"}
				title={t("settings.welcome.discardTitle")}
				confirmLabel={t("settings.welcome.discardConfirm")}
				cancelLabel={t("settings.welcome.discardCancel")}
				telegramNativeMessage={t("settings.welcome.discardBody")}
				onConfirm={() => blocker.proceed?.()}
				onCancel={() => blocker.reset?.()}
			>
				<p>{t("settings.welcome.discardBody")}</p>
			</ConfirmDialog>
		</div>
	);
};
