/** Beszel configuration sub-screen — origin, credential state, test, save. */
import { useBlocker } from "@tanstack/react-router";
import { type FC, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTestBeszel, useUpdateSettings } from "../../hooks/use-admin-settings.ts";
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

interface BeszelConfigProps {
	settings: AdminSettings;
}

export const BeszelConfig: FC<BeszelConfigProps> = ({ settings }) => {
	const { t } = useTranslation();
	const [url, setUrl] = useState(settings.beszelUrl ?? "");
	const [saved, setSaved] = useState(false);
	const [saveFailed, setSaveFailed] = useState(false);
	const updateMutation = useUpdateSettings();
	const testMutation = useTestBeszel();
	const initialUrl = settings.beszelUrl ?? "";
	const dirty = url !== initialUrl;
	const blocker = useBlocker({
		shouldBlockFn: () => dirty && !saved,
		enableBeforeUnload: dirty && !saved,
		withResolver: true,
	});

	useEffect(() => {
		if (!saved) return;
		const timer = setTimeout(() => setSaved(false), 2000);
		return () => clearTimeout(timer);
	}, [saved]);

	const handleSave = async () => {
		setSaveFailed(false);
		try {
			await updateMutation.mutateAsync({ beszelUrl: url || null });
			setSaved(true);
		} catch {
			setSaveFailed(true);
		}
	};

	const connection = testMutation.data;
	const connectionText = connection?.ok
		? t("settings.beszel.connected")
		: connection?.error
			? t("settings.beszel.testError")
			: t("settings.beszel.notTested");
	const connectionTone = connection?.ok ? "positive" : connection?.error ? "negative" : "default";
	const testFailed = !testMutation.isPending && (testMutation.isError || connection?.ok === false);

	return (
		<div className={ss.formPage}>
			{saveFailed && <InlineFeedback attention="action">{t("settings.saveError")}</InlineFeedback>}
			<SettingsPanel title={t("settings.beszel.connectionSection")}>
				<SettingsFields>
					<FormField
						label={t("settings.beszel.urlLabel")}
						htmlFor="beszel-url"
						hint={t("settings.beszel.connectionHint")}
					>
						<FormFieldInput
							id="beszel-url"
							type="url"
							inputMode="url"
							enterKeyHint="done"
							value={url}
							onChange={(event) => {
								setUrl(event.target.value);
								setSaved(false);
								testMutation.reset();
							}}
							placeholder={t("settings.beszel.urlPlaceholder")}
							autoCapitalize="none"
							autoCorrect="off"
							spellCheck={false}
						/>
					</FormField>
				</SettingsFields>
				<SettingsDivider />
				<SettingsStatusRow
					label={t("settings.beszel.credentialsLabel")}
					status={
						settings.beszelCredentialsConfigured
							? t("settings.beszel.credentialsConfigured")
							: t("settings.beszel.credentialsMissing")
					}
					tone={settings.beszelCredentialsConfigured ? "positive" : "negative"}
				/>
				<SettingsDivider />
				<SettingsStatusRow
					label={t("settings.beszel.statusLabel")}
					status={connectionText}
					tone={connectionTone}
					action={
						<ActionBtn
							onClick={() => testMutation.mutate({ url })}
							loading={testMutation.isPending}
							variant="action"
							size="md"
						>
							{t("settings.beszel.test")}
						</ActionBtn>
					}
				/>
			</SettingsPanel>
			{testFailed && (
				<InlineFeedback attention="action">{t("settings.beszel.testError")}</InlineFeedback>
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
				title={t("settings.beszel.discardTitle")}
				confirmLabel={t("settings.beszel.discardConfirm")}
				cancelLabel={t("settings.beszel.discardCancel")}
				telegramNativeMessage={t("settings.beszel.discardBody")}
				onConfirm={() => blocker.proceed?.()}
				onCancel={() => blocker.reset?.()}
			>
				<p>{t("settings.beszel.discardBody")}</p>
			</ConfirmDialog>
		</div>
	);
};
