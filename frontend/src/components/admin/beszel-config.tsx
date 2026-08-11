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
import {
	FormInlineInput,
	FormRow,
	FormRowSeparator,
	FormSectionCard,
	FormSectionFooter,
	FormSectionHeader,
} from "../ui/form-section.tsx";
import { InlineFeedback } from "../ui/inline-feedback.tsx";
import styles from "./provider-config.module.css";

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
	const blocker = useBlocker({ shouldBlockFn: () => dirty && !saved, withResolver: true });

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
	const connectionColor = connection?.ok
		? "var(--v2-text-positive)"
		: connection?.error
			? "var(--v2-text-negative)"
			: "var(--v2-text-secondary)";
	const connectionText = connection?.ok
		? t("settings.beszel.connected")
		: connection?.error
			? t("settings.beszel.testError")
			: t("settings.beszel.notTested");

	return (
		<div className={ss.page}>
			{saveFailed && <InlineFeedback>{t("settings.saveError")}</InlineFeedback>}
			<FormSectionHeader>{t("settings.beszel.connectionSection")}</FormSectionHeader>
			<FormSectionCard>
				<FormRow label={t("settings.beszel.urlLabel")}>
					<FormInlineInput
						value={url}
						onChange={(value) => {
							setUrl(value);
							setSaved(false);
							testMutation.reset();
						}}
						placeholder={t("settings.beszel.urlPlaceholder")}
						mono
						type="url"
					/>
				</FormRow>
				<FormRowSeparator />
				<FormRow label={t("settings.beszel.credentialsLabel")}>
					<span
						className={styles.statusText}
						style={{
							color: settings.beszelCredentialsConfigured
								? "var(--v2-text-positive)"
								: "var(--v2-text-negative)",
						}}
					>
						{settings.beszelCredentialsConfigured
							? t("settings.beszel.credentialsConfigured")
							: t("settings.beszel.credentialsMissing")}
					</span>
				</FormRow>
				<FormRowSeparator />
				<FormRow label={t("settings.beszel.statusLabel")}>
					<span className={styles.statusText} style={{ color: connectionColor }}>
						{connectionText}
					</span>
					<ActionBtn
						onClick={() => testMutation.mutate({ url })}
						loading={testMutation.isPending}
						variant="action"
						size="sm"
					>
						{t("settings.beszel.test")}
					</ActionBtn>
				</FormRow>
			</FormSectionCard>
			<FormSectionFooter>{t("settings.beszel.connectionHint")}</FormSectionFooter>
			{testMutation.isError && <InlineFeedback>{t("settings.beszel.testError")}</InlineFeedback>}

			<FormSaveButton
				dirty={dirty && !saved}
				loading={updateMutation.isPending}
				onSave={handleSave}
			/>

			<ConfirmDialog
				open={blocker.status === "blocked"}
				title={t("settings.beszel.discardTitle")}
				confirmLabel={t("settings.beszel.discardConfirm")}
				cancelLabel={t("settings.beszel.discardCancel")}
				onConfirm={() => blocker.proceed?.()}
				onCancel={() => blocker.reset?.()}
			>
				<p>{t("settings.beszel.discardBody")}</p>
			</ConfirmDialog>
		</div>
	);
};
