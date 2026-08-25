import { useBlocker } from "@tanstack/react-router";
import { type ChangeEvent, type FC, Suspense, lazy, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUpdateSettings } from "../../hooks/use-admin-settings.ts";
import { SUPPORTED_LOCALES, localeLabel } from "../../i18n";
import { apiUploadFile } from "../../lib/api.ts";
import { isMockAuth } from "../../lib/runtime.ts";
import ss from "../../pages/admin/settings.module.css";
import type {
	AdminSettings,
	InviteSharePreviewMode,
	WelcomeMediaUpload,
} from "../../types/admin-settings.ts";
import type { OperatorContent, OperatorContentLocales } from "../../types/operator-content.ts";
import { TelegramHtmlEditor } from "../content/telegram-html-editor.tsx";
import { TemplateVariables } from "../content/template-variables.tsx";
import { ConfirmDialog } from "../ui/confirm-dialog.tsx";
import { FormSaveButton } from "../ui/form-save-button.tsx";
import {
	FormField,
	FormFieldInput,
	FormFieldSelect,
	FormFieldTextarea,
} from "../ui/form-section.tsx";
import { InlineFeedback } from "../ui/inline-feedback.tsx";
import { EditorSkeleton } from "../ui/page-skeleton.tsx";
import { SegmentedControl } from "../ui/segmented-control.tsx";
import { Toggle } from "../ui/toggle.tsx";
import {
	SettingsFields,
	SettingsInset,
	SettingsPanel,
	SettingsStatusRow,
} from "./settings-surface.tsx";
import { WelcomeMediaRow } from "./welcome-media-row.tsx";

const settingsPrefix = isMockAuth ? "/debug/admin/settings" : "/admin/settings";
const INVITE_SHARE_PREVIEW_OPTIONS = [
	{ value: "auto", labelKey: "settings.content.inviteShare.preview.auto" },
	{ value: "hidden", labelKey: "settings.content.inviteShare.preview.hidden" },
	{ value: "small", labelKey: "settings.content.inviteShare.preview.small" },
	{ value: "large", labelKey: "settings.content.inviteShare.preview.large" },
] as const;
const INVITE_SHARE_MEDIA_LABEL_KEYS = {
	photo: "settings.content.inviteShare.mediaType.photo",
	animation: "settings.content.inviteShare.mediaType.animation",
	video: "settings.content.inviteShare.mediaType.video",
} as const;

const FormattedTextEditor = lazy(async () => {
	const module = await import("../content/formatted-text-editor.tsx");
	return { default: module.FormattedTextEditor };
});

type ContentField = Exclude<keyof OperatorContent, "welcomeText" | "welcomeButtonText">;

interface FieldDefinition {
	field: ContentField;
	labelKey: string;
	fallbackKey: string;
	maxLength: number;
	format?: "plain-multiline" | "commonmark" | "telegram-html";
}

interface MessageDefinition {
	key: string;
	titleKey: string;
	destinationKey: string;
	fields: readonly FieldDefinition[];
}

const MESSAGES = [
	{
		key: "inviteRegistration",
		titleKey: "settings.content.messages.inviteRegistration",
		destinationKey: "settings.content.destinations.inviteRegistration",
		fields: [
			{
				field: "onboardingInviteTitle",
				labelKey: "settings.content.fields.inviteTitle",
				fallbackKey: "onboarding.inviteTitle",
				maxLength: 120,
			},
			{
				field: "onboardingInviteDescription",
				labelKey: "settings.content.fields.inviteDescription",
				fallbackKey: "onboarding.inviteDescription",
				maxLength: 500,
				format: "commonmark",
			},
			{
				field: "onboardingRedeemAction",
				labelKey: "settings.content.fields.redeemAction",
				fallbackKey: "onboarding.redeem",
				maxLength: 80,
			},
		],
	},
	{
		key: "openRegistration",
		titleKey: "settings.content.messages.openRegistration",
		destinationKey: "settings.content.destinations.openRegistration",
		fields: [
			{
				field: "onboardingOpenTitle",
				labelKey: "settings.content.fields.openTitle",
				fallbackKey: "onboarding.openTitle",
				maxLength: 120,
			},
			{
				field: "onboardingOpenDescription",
				labelKey: "settings.content.fields.openDescription",
				fallbackKey: "onboarding.openDescription",
				maxLength: 500,
				format: "commonmark",
			},
			{
				field: "onboardingRegisterAction",
				labelKey: "settings.content.fields.registerAction",
				fallbackKey: "onboarding.register",
				maxLength: 80,
			},
		],
	},
	{
		key: "inviteCard",
		titleKey: "settings.content.messages.inviteCard",
		destinationKey: "settings.content.destinations.inviteCard",
		fields: [
			{
				field: "inviteTitle",
				labelKey: "settings.content.fields.cardTitle",
				fallbackKey: "home.invite.title",
				maxLength: 120,
			},
			{
				field: "inviteDescription",
				labelKey: "settings.content.fields.cardDescription",
				fallbackKey: "home.invite.description",
				maxLength: 500,
				format: "commonmark",
			},
		],
	},
	{
		key: "inviteShare",
		titleKey: "settings.content.messages.inviteShare",
		destinationKey: "settings.content.destinations.inviteShare",
		fields: [
			{
				field: "inviteShareText",
				labelKey: "settings.content.fields.shareText",
				fallbackKey: "home.invite.shareText",
				maxLength: 500,
				format: "telegram-html",
			},
			{
				field: "inviteShareButtonText",
				labelKey: "settings.content.fields.shareButtonText",
				fallbackKey: "settings.content.inviteShare.buttonPlaceholder",
				maxLength: 100,
			},
		],
	},
	{
		key: "sponsorNoAccess",
		titleKey: "settings.content.messages.sponsorNoAccess",
		destinationKey: "settings.content.destinations.sponsorNoAccess",
		fields: [
			{
				field: "sponsorNoAccessTitle",
				labelKey: "settings.content.fields.noAccessTitle",
				fallbackKey: "home.sponsor.state.noAccess.title",
				maxLength: 120,
			},
			{
				field: "sponsorNoAccessDescription",
				labelKey: "settings.content.fields.noAccessDescription",
				fallbackKey: "home.sponsor.state.noAccess.description",
				maxLength: 500,
				format: "commonmark",
			},
		],
	},
	{
		key: "sponsorBaseAccess",
		titleKey: "settings.content.messages.sponsorBaseAccess",
		destinationKey: "settings.content.destinations.sponsorBaseAccess",
		fields: [
			{
				field: "sponsorBaseAccessTitle",
				labelKey: "settings.content.fields.baseAccessTitle",
				fallbackKey: "home.sponsor.state.baseAccess.title",
				maxLength: 120,
			},
			{
				field: "sponsorBaseAccessDescription",
				labelKey: "settings.content.fields.baseAccessDescription",
				fallbackKey: "home.sponsor.state.baseAccess.description",
				maxLength: 500,
				format: "commonmark",
			},
		],
	},
	{
		key: "sponsorAction",
		titleKey: "settings.content.messages.sponsorAction",
		destinationKey: "settings.content.destinations.sponsorAction",
		fields: [
			{
				field: "sponsorChooseAction",
				labelKey: "settings.content.fields.chooseAction",
				fallbackKey: "home.sponsor.action.choose",
				maxLength: 100,
			},
		],
	},
] as const satisfies readonly MessageDefinition[];

type MessageKey = (typeof MESSAGES)[number]["key"];

function isMessageKey(value: string): value is MessageKey {
	return MESSAGES.some((message) => message.key === value);
}

interface ContentConfigProps {
	settings: AdminSettings;
	initialMessageKey?: string;
}

interface InviteShareSettings {
	mediaFileId: AdminSettings["inviteShareMediaFileId"];
	mediaFileName: AdminSettings["inviteShareMediaFileName"];
	mediaType: AdminSettings["inviteShareMediaType"];
	previewMode: AdminSettings["inviteSharePreviewMode"];
	allowUserChats: AdminSettings["inviteShareAllowUserChats"];
	allowBotChats: AdminSettings["inviteShareAllowBotChats"];
	allowGroupChats: AdminSettings["inviteShareAllowGroupChats"];
	allowChannelChats: AdminSettings["inviteShareAllowChannelChats"];
}

function inviteShareSettingsFrom(settings: AdminSettings): InviteShareSettings {
	return {
		mediaFileId: settings.inviteShareMediaFileId,
		mediaFileName: settings.inviteShareMediaFileName,
		mediaType: settings.inviteShareMediaType,
		previewMode: settings.inviteSharePreviewMode,
		allowUserChats: settings.inviteShareAllowUserChats,
		allowBotChats: settings.inviteShareAllowBotChats,
		allowGroupChats: settings.inviteShareAllowGroupChats,
		allowChannelChats: settings.inviteShareAllowChannelChats,
	};
}

export const ContentConfig: FC<ContentConfigProps> = ({ settings, initialMessageKey }) => {
	const { t, i18n } = useTranslation();
	const [initialLocales, setInitialLocales] = useState(() =>
		structuredClone(settings.contentLocales),
	);
	const [contentLocales, setContentLocales] = useState(() =>
		structuredClone(settings.contentLocales),
	);
	const [locale, setLocale] = useState(
		SUPPORTED_LOCALES.includes(settings.contentDefaultLocale)
			? settings.contentDefaultLocale
			: (SUPPORTED_LOCALES[0] ?? "en"),
	);
	const [messageKey, setMessageKey] = useState<MessageKey>(() =>
		initialMessageKey && isMessageKey(initialMessageKey) ? initialMessageKey : "inviteRegistration",
	);
	const [initialShareSettings, setInitialShareSettings] = useState(() =>
		inviteShareSettingsFrom(settings),
	);
	const [shareSettings, setShareSettings] = useState(() => ({ ...initialShareSettings }));
	const [saveFailed, setSaveFailed] = useState(false);
	const [uploading, setUploading] = useState(false);
	const updateMutation = useUpdateSettings();
	useEffect(() => {
		if (initialMessageKey && isMessageKey(initialMessageKey)) setMessageKey(initialMessageKey);
	}, [initialMessageKey]);
	const content = contentLocales[locale] ?? {};
	const targetT = i18n.getFixedT(locale);
	const message = MESSAGES.find((candidate) => candidate.key === messageKey) ?? MESSAGES[0];
	const variables = [
		...new Set(
			message.fields.flatMap(
				(definition) => settings.contentTemplateVariables[definition.field] ?? [],
			),
		),
	];
	const dirty =
		JSON.stringify(contentLocales) !== JSON.stringify(initialLocales) ||
		JSON.stringify(shareSettings) !== JSON.stringify(initialShareSettings);
	const blocker = useBlocker({
		shouldBlockFn: () => dirty,
		enableBeforeUnload: dirty,
		withResolver: true,
	});

	const updateField = (field: ContentField, value: string) => {
		setContentLocales((current) => ({
			...current,
			[locale]: { ...current[locale], [field]: value || null },
		}));
	};

	const handleSave = async () => {
		setSaveFailed(false);
		const submittedLocales = contentLocales;
		const submittedShareSettings = shareSettings;
		try {
			const updated = await updateMutation.mutateAsync({
				contentLocales: submittedLocales,
				inviteShareMediaFileId: submittedShareSettings.mediaFileId,
				inviteShareMediaFileName: submittedShareSettings.mediaFileName,
				inviteShareMediaType: submittedShareSettings.mediaType,
				inviteSharePreviewMode: submittedShareSettings.previewMode,
				inviteShareAllowUserChats: submittedShareSettings.allowUserChats,
				inviteShareAllowBotChats: submittedShareSettings.allowBotChats,
				inviteShareAllowGroupChats: submittedShareSettings.allowGroupChats,
				inviteShareAllowChannelChats: submittedShareSettings.allowChannelChats,
			});
			const savedLocales: OperatorContentLocales = structuredClone(updated.contentLocales);
			const savedShareSettings = inviteShareSettingsFrom(updated);
			setInitialLocales(savedLocales);
			setInitialShareSettings(savedShareSettings);
			setContentLocales((current) =>
				current === submittedLocales ? structuredClone(savedLocales) : current,
			);
			setShareSettings((current) =>
				current === submittedShareSettings ? { ...savedShareSettings } : current,
			);
		} catch {
			setSaveFailed(true);
		}
	};

	const handlePickShareMedia = async (file: File) => {
		setSaveFailed(false);
		setUploading(true);
		try {
			const result = await apiUploadFile<WelcomeMediaUpload>(
				`${settingsPrefix}/invite-share-media`,
				file,
			);
			setShareSettings((current) => ({
				...current,
				mediaFileId: result.fileId,
				mediaFileName: result.fileName,
				mediaType: result.mediaType as AdminSettings["inviteShareMediaType"],
			}));
		} catch {
			setSaveFailed(true);
		} finally {
			setUploading(false);
		}
	};

	const updateAudience = (
		field: "allowUserChats" | "allowBotChats" | "allowGroupChats" | "allowChannelChats",
		value: boolean,
	) => {
		setShareSettings((current) => ({ ...current, [field]: value }));
	};
	const audience = [
		[
			"allowUserChats",
			"settings.content.inviteShare.audienceUsers",
			"settings.content.inviteShare.audienceUsersDescription",
		],
		[
			"allowGroupChats",
			"settings.content.inviteShare.audienceGroups",
			"settings.content.inviteShare.audienceGroupsDescription",
		],
		[
			"allowChannelChats",
			"settings.content.inviteShare.audienceChannels",
			"settings.content.inviteShare.audienceChannelsDescription",
		],
		[
			"allowBotChats",
			"settings.content.inviteShare.audienceBots",
			"settings.content.inviteShare.audienceBotsDescription",
		],
	] as const;
	const enabledAudienceCount = audience.filter(([field]) => shareSettings[field]).length;

	return (
		<div className={ss.formPage}>
			{saveFailed && <InlineFeedback attention="action">{t("settings.saveError")}</InlineFeedback>}
			{SUPPORTED_LOCALES.length > 1 && (
				<SettingsPanel title={t("settings.content.languageSection")}>
					<SettingsFields>
						<FormField
							label={t("settings.content.languageLabel")}
							hint={t("settings.content.languageHint")}
						>
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
					</SettingsFields>
				</SettingsPanel>
			)}

			<SettingsPanel title={t("settings.content.messageSection")}>
				<SettingsFields>
					<FormField
						label={t("settings.content.messageLabel")}
						htmlFor="tone-of-voice-message"
						hint={t(message.destinationKey)}
					>
						<FormFieldSelect
							id="tone-of-voice-message"
							value={messageKey}
							options={MESSAGES.map((candidate) => ({
								value: candidate.key,
								label: t(candidate.titleKey),
							}))}
							onChange={(event) => {
								if (isMessageKey(event.target.value)) setMessageKey(event.target.value);
							}}
						/>
					</FormField>
				</SettingsFields>
			</SettingsPanel>

			<SettingsPanel title={t(message.titleKey)}>
				<SettingsFields>
					{message.fields.map((definition) => {
						const id = `content-${locale}-${definition.field}`;
						const commonProps = {
							id,
							value: content[definition.field] ?? "",
							placeholder: targetT(definition.fallbackKey),
						};
						return (
							<FormField key={definition.field} label={t(definition.labelKey)} htmlFor={id}>
								{"format" in definition && definition.format === "telegram-html" ? (
									<TelegramHtmlEditor
										{...commonProps}
										ariaLabel={t(definition.labelKey)}
										maxLength={definition.maxLength}
										allowCustomEmoji={false}
										onChange={(value) => updateField(definition.field, value)}
									/>
								) : "format" in definition && definition.format === "commonmark" ? (
									<Suspense fallback={<EditorSkeleton />}>
										<FormattedTextEditor
											{...commonProps}
											ariaLabel={t(definition.labelKey)}
											maxLength={definition.maxLength}
											onChange={(value) => updateField(definition.field, value)}
										/>
									</Suspense>
								) : "format" in definition && definition.format === "plain-multiline" ? (
									<FormFieldTextarea
										{...commonProps}
										maxLength={definition.maxLength}
										rows={3}
										onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
											updateField(definition.field, event.target.value)
										}
									/>
								) : (
									<FormFieldInput
										{...commonProps}
										maxLength={definition.maxLength}
										enterKeyHint="next"
										onChange={(event: ChangeEvent<HTMLInputElement>) =>
											updateField(definition.field, event.target.value)
										}
									/>
								)}
							</FormField>
						);
					})}
				</SettingsFields>
			</SettingsPanel>

			{messageKey === "inviteShare" && (
				<>
					<SettingsPanel title={t("settings.content.inviteShare.deliverySection")}>
						<SettingsFields>
							<FormField
								label={t("settings.content.inviteShare.mediaLabel")}
								hint={t("settings.content.inviteShare.mediaHint")}
							>
								<WelcomeMediaRow
									fileName={
										shareSettings.mediaFileName ?? t("settings.content.inviteShare.noMedia")
									}
									mediaType={shareSettings.mediaType ?? "animation"}
									description={
										shareSettings.mediaType
											? t(INVITE_SHARE_MEDIA_LABEL_KEYS[shareSettings.mediaType])
											: t("settings.content.inviteShare.mediaNone")
									}
									isDefault={shareSettings.mediaFileId === null}
									empty={shareSettings.mediaFileId === null}
									uploading={uploading}
									onPickFile={handlePickShareMedia}
									onReset={() => {
										setShareSettings((current) => ({
											...current,
											mediaFileId: null,
											mediaFileName: null,
											mediaType: null,
										}));
									}}
								/>
							</FormField>
							<FormField
								label={t("settings.content.inviteShare.previewLabel")}
								htmlFor="invite-share-preview"
								hint={
									shareSettings.mediaFileId
										? t("settings.content.inviteShare.previewMediaHint")
										: t("settings.content.inviteShare.previewHint")
								}
							>
								<FormFieldSelect
									id="invite-share-preview"
									value={shareSettings.previewMode}
									disabled={shareSettings.mediaFileId !== null}
									options={INVITE_SHARE_PREVIEW_OPTIONS.map(({ value, labelKey }) => ({
										value,
										label: t(labelKey),
									}))}
									onChange={(event) => {
										setShareSettings((current) => ({
											...current,
											previewMode: event.target.value as InviteSharePreviewMode,
										}));
									}}
								/>
							</FormField>
						</SettingsFields>
					</SettingsPanel>

					<SettingsPanel title={t("settings.content.inviteShare.audienceSection")}>
						<div className={ss.panelInset}>
							<p className={ss.providerDescription}>
								{t("settings.content.inviteShare.audienceHint")}
							</p>
						</div>
						{audience.map(([field, labelKey, descriptionKey]) => (
							<SettingsStatusRow
								key={field}
								label={t(labelKey)}
								description={t(descriptionKey)}
								action={
									<Toggle
										checked={shareSettings[field]}
										ariaLabel={t(labelKey)}
										ariaDisabled={shareSettings[field] && enabledAudienceCount === 1}
										onChange={(value) => updateAudience(field, value)}
									/>
								}
							/>
						))}
					</SettingsPanel>
				</>
			)}

			<SettingsPanel title={t("settings.content.variablesSection")}>
				<SettingsInset>
					<TemplateVariables variables={variables} disclosure={false} />
				</SettingsInset>
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
				title={t("settings.content.discardTitle")}
				confirmLabel={t("settings.content.discardConfirm")}
				cancelLabel={t("settings.content.discardCancel")}
				telegramNativeMessage={t("settings.content.discardBody")}
				onConfirm={() => blocker.proceed?.()}
				onCancel={() => blocker.reset?.()}
			>
				<p>{t("settings.content.discardBody")}</p>
			</ConfirmDialog>
		</div>
	);
};
