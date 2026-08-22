import { useBlocker } from "@tanstack/react-router";
/**
 * Kuma configuration sub-screen — URL, slug, connection test, save.
 */
import { type FC, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTestKuma, useUpdateSettings } from "../../hooks/use-admin-settings.ts";
import ss from "../../pages/admin/settings.module.css";
import type { AdminSettings } from "../../types/admin-settings.ts";
import { ActionBtn } from "../ui/action-btn.tsx";
import { ConfirmDialog } from "../ui/confirm-dialog.tsx";
import { FormSaveButton } from "../ui/form-save-button.tsx";
import { FormField, FormFieldInput } from "../ui/form-section.tsx";
import { InlineFeedback } from "../ui/inline-feedback.tsx";
import {
	SettingsDivider,
	SettingsFields,
	SettingsPanel,
	SettingsStatusRow,
} from "./settings-surface.tsx";

interface KumaConfigProps {
	settings: AdminSettings;
}

export const KumaConfig: FC<KumaConfigProps> = ({ settings }) => {
	const { t } = useTranslation();
	const [url, setUrl] = useState(settings.kumaUrl ?? "");
	const [slug, setSlug] = useState(settings.kumaSlug ?? "");
	const [saved, setSaved] = useState(false);
	const [saveFailed, setSaveFailed] = useState(false);
	const updateMutation = useUpdateSettings();
	const testMutation = useTestKuma();

	const initUrl = settings.kumaUrl ?? "";
	const initSlug = settings.kumaSlug ?? "";
	const dirty = url !== initUrl || slug !== initSlug;

	const blocker = useBlocker({
		shouldBlockFn: () => dirty && !saved,
		enableBeforeUnload: dirty && !saved,
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
				kumaUrl: url || null,
				kumaSlug: slug || null,
			});
			setSaved(true);
		} catch {
			setSaveFailed(true);
		}
	};

	const connStatus = testMutation.data;
	const connText = connStatus?.ok
		? t("settings.kuma.connected")
		: connStatus?.error
			? t("settings.kuma.testError")
			: t("settings.kuma.notTested");
	const connTone = connStatus?.ok ? "positive" : connStatus?.error ? "negative" : "default";
	const testFailed = !testMutation.isPending && (testMutation.isError || connStatus?.ok === false);

	return (
		<div className={ss.formPage}>
			{saveFailed && <InlineFeedback attention="action">{t("settings.saveError")}</InlineFeedback>}
			<SettingsPanel title={t("settings.kuma.connectionSection")}>
				<SettingsFields>
					<FormField
						label={t("settings.kuma.urlLabel")}
						htmlFor="kuma-url"
						hint={t("settings.kuma.connectionHint")}
					>
						<FormFieldInput
							id="kuma-url"
							type="url"
							inputMode="url"
							enterKeyHint="next"
							value={url}
							onChange={(event) => {
								setUrl(event.target.value);
								setSaved(false);
								testMutation.reset();
							}}
							placeholder={t("settings.kuma.urlPlaceholder")}
							autoCapitalize="none"
							autoCorrect="off"
							spellCheck={false}
						/>
					</FormField>
					<FormField label={t("settings.kuma.slugLabel")} htmlFor="kuma-slug">
						<FormFieldInput
							id="kuma-slug"
							value={slug}
							enterKeyHint="done"
							onChange={(event) => {
								setSlug(event.target.value);
								setSaved(false);
								testMutation.reset();
							}}
							placeholder={t("settings.kuma.slugPlaceholder")}
							autoCapitalize="none"
							autoCorrect="off"
							spellCheck={false}
						/>
					</FormField>
				</SettingsFields>
				<SettingsDivider />
				<SettingsStatusRow
					label={t("settings.kuma.statusLabel")}
					status={connText}
					tone={connTone}
					action={
						<ActionBtn
							onClick={() => testMutation.mutate({ url, slug })}
							loading={testMutation.isPending}
							variant="action"
							size="md"
						>
							{t("settings.kuma.test")}
						</ActionBtn>
					}
				/>
			</SettingsPanel>
			{testFailed && (
				<InlineFeedback attention="action">{t("settings.kuma.testError")}</InlineFeedback>
			)}

			<FormSaveButton
				dirty={dirty && !saved}
				loading={updateMutation.isPending}
				onSave={handleSave}
				telegramMainButton
				telegramMainButtonVisible={blocker.status !== "blocked"}
			/>

			<ConfirmDialog
				open={blocker.status === "blocked"}
				title={t("settings.kuma.discardTitle")}
				confirmLabel={t("settings.kuma.discardConfirm")}
				cancelLabel={t("settings.kuma.discardCancel")}
				onConfirm={() => blocker.proceed?.()}
				onCancel={() => blocker.reset?.()}
			>
				<p>{t("settings.kuma.discardBody")}</p>
			</ConfirmDialog>
		</div>
	);
};
