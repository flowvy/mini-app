import { useBlocker } from "@tanstack/react-router";
/** Welcome Message sub-screen — text, media file upload, button text, save. */
import { ArrowLeft } from "lucide-react";
import { type FC, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUpdateSettings } from "../../hooks/use-admin-settings.ts";
import { apiUploadFile } from "../../lib/api.ts";
import ss from "../../pages/admin/settings.module.css";
import type { AdminSettings, WelcomeMediaUpload } from "../../types/admin-settings.ts";
import { ConfirmDialog } from "../ui/confirm-dialog.tsx";
import { FormSaveButton } from "../ui/form-save-button.tsx";
import {
	FormInlineInput,
	FormRow,
	FormSectionCard,
	FormSectionFooter,
	FormSectionHeader,
	FormTextarea,
} from "../ui/form-section.tsx";
import { InlineFeedback } from "../ui/inline-feedback.tsx";
import { WelcomeMediaRow } from "./welcome-media-row.tsx";

const isMockAuth = import.meta.env.VITE_MOCK_AUTH === "true";
const prefix = isMockAuth ? "/debug/admin/settings" : "/admin/settings";

interface WelcomeConfigProps {
	settings: AdminSettings;
	onBack: () => void;
}

export const WelcomeConfig: FC<WelcomeConfigProps> = ({ settings, onBack }) => {
	const { t } = useTranslation();
	const [text, setText] = useState(settings.welcomeText ?? "");
	const [buttonText, setButtonText] = useState(settings.welcomeButtonText ?? "");
	const [mediaFileId, setMediaFileId] = useState(settings.welcomeMediaFileId);
	const [mediaFileName, setMediaFileName] = useState(settings.welcomeMediaFileName);
	const [mediaType, setMediaType] = useState(settings.welcomeMediaType);
	const [saved, setSaved] = useState(false);
	const [uploading, setUploading] = useState(false);
	const [feedbackError, setFeedbackError] = useState<string | null>(null);
	const backButtonRef = useRef<HTMLButtonElement>(null);

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
		shouldBlockFn: () => dirty,
		withResolver: true,
	});

	const isDefault = mediaFileId === null && settings.welcomeMediaUrl === null;
	const displayName = mediaFileId
		? (mediaFileName ?? "custom")
		: (settings.welcomeMediaUrl ?? "main_card.mp4");
	const displayType = mediaType ?? "animation";

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
		<div className={ss.page}>
			{feedbackError && <InlineFeedback>{feedbackError}</InlineFeedback>}
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
				<h1 className={ss.headerTitle}>{t("settings.welcome.title")}</h1>
			</div>

			<FormSectionHeader>{t("settings.welcome.messageSection")}</FormSectionHeader>
			<FormSectionCard>
				<FormTextarea
					value={text}
					onChange={(v) => {
						setText(v);
						setSaved(false);
					}}
					placeholder={t("settings.welcome.messagePlaceholder")}
				/>
			</FormSectionCard>
			<FormSectionFooter>{t("settings.welcome.messageHint")}</FormSectionFooter>

			<FormSectionHeader>{t("settings.welcome.mediaSection")}</FormSectionHeader>
			<FormSectionCard>
				<WelcomeMediaRow
					fileName={displayName}
					mediaType={displayType}
					isDefault={isDefault && !mediaDirty}
					uploading={uploading}
					onPickFile={handlePickFile}
					onReset={handleReset}
				/>
			</FormSectionCard>
			<FormSectionFooter>{t("settings.welcome.mediaHint")}</FormSectionFooter>

			<FormSectionHeader>{t("settings.welcome.buttonSection")}</FormSectionHeader>
			<FormSectionCard>
				<FormRow label={t("settings.welcome.buttonTextLabel")}>
					<FormInlineInput
						value={buttonText}
						onChange={(v) => {
							setButtonText(v);
							setSaved(false);
						}}
						placeholder={t("settings.welcome.buttonTextPlaceholder")}
					/>
				</FormRow>
			</FormSectionCard>
			<FormSectionFooter>{t("settings.welcome.buttonHint")}</FormSectionFooter>

			<FormSectionFooter warning>{t("settings.welcome.premiumWarning")}</FormSectionFooter>

			<FormSaveButton
				dirty={dirty && !saved}
				loading={updateMutation.isPending}
				onSave={handleSave}
			/>

			<ConfirmDialog
				open={blocker.status === "blocked"}
				returnFocusRef={backButtonRef}
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
