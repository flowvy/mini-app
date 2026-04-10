/** Welcome Message sub-screen — text, media URL, button text, save. */
import { ArrowLeft } from "lucide-react";
import { type FC, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUpdateSettings } from "../../hooks/use-admin-settings.ts";
import ss from "../../pages/admin/settings.module.css";
import type { AdminSettings } from "../../types/admin-settings.ts";
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

interface WelcomeConfigProps {
	settings: AdminSettings;
	onBack: () => void;
}

export const WelcomeConfig: FC<WelcomeConfigProps> = ({ settings, onBack }) => {
	const { t } = useTranslation();
	const [text, setText] = useState(settings.welcomeText ?? "");
	const [mediaUrl, setMediaUrl] = useState(settings.welcomeMediaUrl ?? "");
	const [buttonText, setButtonText] = useState(settings.welcomeButtonText ?? "");
	const [saved, setSaved] = useState(false);
	const [showDiscard, setShowDiscard] = useState(false);

	const updateMutation = useUpdateSettings();

	const initText = settings.welcomeText ?? "";
	const initMediaUrl = settings.welcomeMediaUrl ?? "";
	const initButtonText = settings.welcomeButtonText ?? "";
	const dirty = text !== initText || mediaUrl !== initMediaUrl || buttonText !== initButtonText;

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
			welcomeText: text || null,
			welcomeMediaUrl: mediaUrl || null,
			welcomeMediaType: null,
			welcomeButtonText: buttonText || null,
		});
		setSaved(true);
	};

	return (
		<div className={ss.page}>
			<div className={ss.subHeader}>
				<button type="button" className={ss.backBtn} onClick={handleBack}>
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
				<FormRow label={t("settings.welcome.mediaUrlLabel")}>
					<FormInlineInput
						value={mediaUrl}
						onChange={(v) => {
							setMediaUrl(v);
							setSaved(false);
						}}
						placeholder={t("settings.welcome.mediaUrlPlaceholder")}
						mono
					/>
				</FormRow>
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
				open={showDiscard}
				title={t("settings.welcome.discardTitle")}
				confirmLabel={t("settings.welcome.discardConfirm")}
				cancelLabel={t("settings.welcome.discardCancel")}
				onConfirm={onBack}
				onCancel={() => setShowDiscard(false)}
			>
				<p>{t("settings.welcome.discardBody")}</p>
			</ConfirmDialog>
		</div>
	);
};
