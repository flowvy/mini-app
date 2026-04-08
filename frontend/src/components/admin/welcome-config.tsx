/** Welcome Message sub-screen — text, media URL, media type, button text, save. */
import { ArrowLeft, Check, Info } from "lucide-react";
import { type FC, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUpdateSettings } from "../../hooks/use-admin-settings.ts";
import ss from "../../pages/admin/settings.module.css";
import type { AdminSettings } from "../../types/admin-settings.ts";
import { ActionBtn } from "../ui/action-btn.tsx";
import { ConfirmDialog } from "../ui/confirm-dialog.tsx";
import { InputField } from "../ui/input-field.tsx";
import { SegmentedControl } from "../ui/segmented-control.tsx";
import styles from "./welcome-config.module.css";

interface WelcomeConfigProps {
	settings: AdminSettings;
	onBack: () => void;
}

const MEDIA_TYPE_OPTIONS = [
	{ key: "animation", label: "settings.welcome.mediaTypeAnimation" },
	{ key: "photo", label: "settings.welcome.mediaTypePhoto" },
	{ key: "none", label: "settings.welcome.mediaTypeNone" },
];

function resolveMediaType(url: string | null, type: string | null): string {
	if (type) return type;
	return url ? "animation" : "none";
}

export const WelcomeConfig: FC<WelcomeConfigProps> = ({ settings, onBack }) => {
	const { t } = useTranslation();
	const [text, setText] = useState(settings.welcomeText ?? "");
	const [mediaUrl, setMediaUrl] = useState(settings.welcomeMediaUrl ?? "");
	const [mediaType, setMediaType] = useState(
		resolveMediaType(settings.welcomeMediaUrl, settings.welcomeMediaType),
	);
	const [buttonText, setButtonText] = useState(settings.welcomeButtonText ?? "");
	const [saved, setSaved] = useState(false);
	const [showDiscard, setShowDiscard] = useState(false);
	const [textareaFocused, setTextareaFocused] = useState(false);

	const updateMutation = useUpdateSettings();

	const initText = settings.welcomeText ?? "";
	const initMediaUrl = settings.welcomeMediaUrl ?? "";
	const initMediaType = resolveMediaType(settings.welcomeMediaUrl, settings.welcomeMediaType);
	const initButtonText = settings.welcomeButtonText ?? "";
	const dirty =
		text !== initText ||
		mediaUrl !== initMediaUrl ||
		mediaType !== initMediaType ||
		buttonText !== initButtonText;

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
			welcomeMediaType: mediaType === "none" ? null : mediaType,
			welcomeButtonText: buttonText || null,
		});
		setSaved(true);
	};

	const translatedOptions = MEDIA_TYPE_OPTIONS.map((opt) => ({
		key: opt.key,
		label: t(opt.label),
	}));

	return (
		<div className={ss.page}>
			<div className={ss.subHeader}>
				<button type="button" className={ss.backBtn} onClick={handleBack}>
					<ArrowLeft size={16} />
				</button>
				<h1 className={ss.headerTitle}>{t("settings.welcome.title")}</h1>
			</div>

			<div className={ss.sectionBody}>
				<div className={ss.inputRow}>
					<div className={ss.inputRowLabels}>
						<span className={ss.rowLabel}>{t("settings.welcome.messageLabel")}</span>
						<span className={ss.rowDesc}>{t("settings.welcome.messageDesc")}</span>
					</div>
					<textarea
						value={text}
						onChange={(e) => {
							setText(e.target.value);
							setSaved(false);
						}}
						placeholder={t("settings.welcome.messagePlaceholder")}
						onFocus={() => setTextareaFocused(true)}
						onBlur={() => setTextareaFocused(false)}
						className={`${styles.textarea} ${textareaFocused ? styles.textareaFocused : ""}`}
						rows={4}
					/>
				</div>

				<div className={ss.inputRow}>
					<div className={ss.inputRowLabels}>
						<span className={ss.rowLabel}>{t("settings.welcome.mediaUrlLabel")}</span>
						<span className={ss.rowDesc}>{t("settings.welcome.mediaUrlDesc")}</span>
					</div>
					<InputField
						value={mediaUrl}
						onChange={(v) => {
							setMediaUrl(v);
							setSaved(false);
						}}
						placeholder={t("settings.welcome.mediaUrlPlaceholder")}
					/>
				</div>

				<div className={ss.inputRow}>
					<div className={ss.inputRowLabels}>
						<span className={ss.rowLabel}>{t("settings.welcome.mediaTypeLabel")}</span>
					</div>
					<SegmentedControl
						options={translatedOptions}
						value={mediaType}
						onChange={(v) => {
							setMediaType(v);
							setSaved(false);
						}}
					/>
				</div>

				<div className={ss.inputRow}>
					<div className={ss.inputRowLabels}>
						<span className={ss.rowLabel}>{t("settings.welcome.buttonTextLabel")}</span>
						<span className={ss.rowDesc}>{t("settings.welcome.buttonTextDesc")}</span>
					</div>
					<InputField
						value={buttonText}
						onChange={(v) => {
							setButtonText(v);
							setSaved(false);
						}}
						placeholder={t("settings.welcome.buttonTextPlaceholder")}
					/>
				</div>

				{(dirty || saved) && (
					<div className={ss.saveBar}>
						{saved && (
							<span className={ss.savedText}>
								<Check size={12} /> {t("settings.welcome.saved")}
							</span>
						)}
						{dirty && !saved && (
							<ActionBtn onClick={handleSave} loading={updateMutation.isPending} size="md">
								{t("settings.welcome.save")}
							</ActionBtn>
						)}
					</div>
				)}
			</div>

			<div className={styles.infoBanner}>
				<Info size={16} className={styles.infoBannerIcon} />
				<span className={styles.infoBannerText}>{t("settings.welcome.premiumWarning")}</span>
			</div>

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
