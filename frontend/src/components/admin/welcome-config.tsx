import { useBlocker } from "@tanstack/react-router";
/** Welcome Message sub-screen — text, media file upload, button text, save. */
import { BadgeInfo } from "lucide-react";
import { type FC, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUpdateSettings } from "../../hooks/use-admin-settings.ts";
import { apiUploadFile } from "../../lib/api.ts";
import { isMockAuth } from "../../lib/runtime.ts";
import ss from "../../pages/admin/settings.module.css";
import type { AdminSettings, WelcomeMediaUpload } from "../../types/admin-settings.ts";
import { ConfirmDialog } from "../ui/confirm-dialog.tsx";
import { FormSaveButton } from "../ui/form-save-button.tsx";
import { FormField, FormFieldInput, FormFieldTextarea } from "../ui/form-section.tsx";
import { InlineFeedback } from "../ui/inline-feedback.tsx";
import { SettingsFields, SettingsInlineNotice, SettingsPanel } from "./settings-surface.tsx";
import { WelcomeMediaRow } from "./welcome-media-row.tsx";

const prefix = isMockAuth ? "/debug/admin/settings" : "/admin/settings";

interface WelcomeConfigProps {
	settings: AdminSettings;
}

export const WelcomeConfig: FC<WelcomeConfigProps> = ({ settings }) => {
	const { t } = useTranslation();
	const [text, setText] = useState(settings.welcomeText ?? "");
	const [buttonText, setButtonText] = useState(settings.welcomeButtonText ?? "");
	const [mediaFileId, setMediaFileId] = useState(settings.welcomeMediaFileId);
	const [mediaFileName, setMediaFileName] = useState(settings.welcomeMediaFileName);
	const [mediaType, setMediaType] = useState(settings.welcomeMediaType);
	const [saved, setSaved] = useState(false);
	const [uploading, setUploading] = useState(false);
	const [feedbackError, setFeedbackError] = useState<string | null>(null);
	const updateMutation = useUpdateSettings();

	const initText = settings.welcomeText ?? "";
	const initButtonText = settings.welcomeButtonText ?? "";
	const textDirty = text !== initText || buttonText !== initButtonText;
	const mediaDirty =
		mediaFileId !== settings.welcomeMediaFileId ||
		mediaFileName !== settings.welcomeMediaFileName ||
		mediaType !== settings.welcomeMediaType;
	const dirty = textDirty || mediaDirty;

	const blocker = useBlocker({
		shouldBlockFn: () => dirty && !saved,
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

	useEffect(() => {
		if (saved) {
			const timer = setTimeout(() => setSaved(false), 2000);
			return () => clearTimeout(timer);
		}
	}, [saved]);

	const handleSave = async () => {
		setFeedbackError(null);
		try {
			await updateMutation.mutateAsync({
				welcomeText: text || null,
				welcomeButtonText: buttonText || null,
				welcomeMediaFileId: mediaFileId,
				welcomeMediaFileName: mediaFileName,
				welcomeMediaType: mediaType,
				welcomeMediaUrl: mediaFileId ? null : undefined,
			});
			setSaved(true);
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
			setSaved(false);
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
		setSaved(false);
	};

	return (
		<div className={ss.formPage}>
			{feedbackError && <InlineFeedback>{feedbackError}</InlineFeedback>}
			<SettingsPanel title={t("settings.welcome.contentSection")}>
				<SettingsFields>
					<FormField
						label={t("settings.welcome.messageLabel")}
						htmlFor="welcome-message"
						notice={
							<SettingsInlineNotice icon={<BadgeInfo size={13} aria-hidden="true" />}>
								{t("settings.welcome.premiumWarning")}
							</SettingsInlineNotice>
						}
					>
						<FormFieldTextarea
							id="welcome-message"
							value={text}
							onChange={(event) => {
								setText(event.target.value);
								setSaved(false);
							}}
							placeholder={t("settings.welcome.messagePlaceholder")}
							rows={4}
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
							onChange={(event) => {
								setButtonText(event.target.value);
								setSaved(false);
							}}
							placeholder={t("settings.welcome.buttonTextPlaceholder")}
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
				title={t("settings.welcome.discardTitle")}
				confirmLabel={t("settings.welcome.discardConfirm")}
				cancelLabel={t("settings.welcome.discardCancel")}
				onConfirm={() => blocker.proceed?.()}
				onCancel={() => blocker.reset?.()}
			>
				<p>{t("settings.welcome.discardBody")}</p>
			</ConfirmDialog>
		</div>
	);
};
