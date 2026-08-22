import { useBlocker } from "@tanstack/react-router";
import { type ChangeEvent, type FC, Suspense, lazy, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUpdateSettings } from "../../hooks/use-admin-settings.ts";
import { SUPPORTED_LOCALES, localeLabel } from "../../i18n";
import ss from "../../pages/admin/settings.module.css";
import type { AdminSettings } from "../../types/admin-settings.ts";
import type { OperatorContent } from "../../types/operator-content.ts";
import { TemplateVariables } from "../content/template-variables.tsx";
import { ConfirmDialog } from "../ui/confirm-dialog.tsx";
import { FormSaveButton } from "../ui/form-save-button.tsx";
import { FormField, FormFieldInput, FormFieldTextarea } from "../ui/form-section.tsx";
import { InlineFeedback } from "../ui/inline-feedback.tsx";
import { SegmentedControl } from "../ui/segmented-control.tsx";
import { SettingsFields, SettingsPanel } from "./settings-surface.tsx";

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
	format?: "plain-multiline" | "commonmark";
}

interface GroupDefinition {
	titleKey: string;
	fields: FieldDefinition[];
}

const GROUPS: GroupDefinition[] = [
	{
		titleKey: "settings.content.onboardingSection",
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
		titleKey: "settings.content.inviteSection",
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
			{
				field: "inviteShareText",
				labelKey: "settings.content.fields.shareText",
				fallbackKey: "home.invite.shareText",
				maxLength: 500,
				format: "plain-multiline",
			},
		],
	},
	{
		titleKey: "settings.content.sponsorSection",
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
			{
				field: "sponsorChooseAction",
				labelKey: "settings.content.fields.chooseAction",
				fallbackKey: "home.sponsor.action.choose",
				maxLength: 100,
			},
		],
	},
];

interface ContentConfigProps {
	settings: AdminSettings;
}

export const ContentConfig: FC<ContentConfigProps> = ({ settings }) => {
	const { t, i18n } = useTranslation();
	const [initialLocales] = useState(() => structuredClone(settings.contentLocales));
	const [contentLocales, setContentLocales] = useState(() =>
		structuredClone(settings.contentLocales),
	);
	const [locale, setLocale] = useState(
		SUPPORTED_LOCALES.includes(settings.contentDefaultLocale)
			? settings.contentDefaultLocale
			: (SUPPORTED_LOCALES[0] ?? "en"),
	);
	const [saved, setSaved] = useState(false);
	const [saveFailed, setSaveFailed] = useState(false);
	const updateMutation = useUpdateSettings();
	const content = contentLocales[locale] ?? {};
	const dirty = JSON.stringify(contentLocales) !== JSON.stringify(initialLocales);
	const blocker = useBlocker({
		shouldBlockFn: () => dirty && !saved,
		enableBeforeUnload: dirty && !saved,
		withResolver: true,
	});

	useEffect(() => {
		if (!saved) return;
		const timer = window.setTimeout(() => setSaved(false), 2_000);
		return () => window.clearTimeout(timer);
	}, [saved]);

	const updateField = (field: ContentField, value: string) => {
		setContentLocales((current) => ({
			...current,
			[locale]: { ...current[locale], [field]: value || null },
		}));
		setSaved(false);
	};

	const handleSave = async () => {
		setSaveFailed(false);
		try {
			await updateMutation.mutateAsync({ contentLocales });
			setSaved(true);
		} catch {
			setSaveFailed(true);
		}
	};

	return (
		<div className={ss.formPage}>
			{saveFailed && <InlineFeedback attention="action">{t("settings.saveError")}</InlineFeedback>}
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

			{GROUPS.map((group) => (
				<SettingsPanel key={group.titleKey} title={t(group.titleKey)}>
					<SettingsFields>
						{group.fields.map((definition) => {
							const id = `content-${locale}-${definition.field}`;
							const commonProps = {
								id,
								value: content[definition.field] ?? "",
								placeholder: t(definition.fallbackKey),
							};
							return (
								<FormField key={definition.field} label={t(definition.labelKey)} htmlFor={id}>
									{definition.format === "commonmark" ? (
										<Suspense fallback={<output>{t("common.formattedText.loading")}</output>}>
											<FormattedTextEditor
												{...commonProps}
												ariaLabel={t(definition.labelKey)}
												maxLength={definition.maxLength}
												onChange={(value) => updateField(definition.field, value)}
											/>
										</Suspense>
									) : definition.format === "plain-multiline" ? (
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
						{(() => {
							const variables = [
								...new Set(
									group.fields.flatMap(
										(definition) => settings.contentTemplateVariables[definition.field] ?? [],
									),
								),
							];
							const scopes = Object.fromEntries(
								variables.map((variable) => [
									variable,
									group.fields
										.filter((definition) =>
											(settings.contentTemplateVariables[definition.field] ?? []).includes(
												variable,
											),
										)
										.map((definition) => t(definition.labelKey)),
								]),
							);
							return <TemplateVariables variables={variables} scopes={scopes} />;
						})()}
					</SettingsFields>
				</SettingsPanel>
			))}

			<FormSaveButton
				dirty={dirty && !saved}
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
				onConfirm={() => blocker.proceed?.()}
				onCancel={() => blocker.reset?.()}
			>
				<p>{t("settings.content.discardBody")}</p>
			</ConfirmDialog>
		</div>
	);
};
