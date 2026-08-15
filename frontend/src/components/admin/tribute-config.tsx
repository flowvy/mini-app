/** Tribute setup screen — server-side credential, read-only API check, and capability map. */
import { BadgeInfo } from "lucide-react";
import type { FC } from "react";
import { useTranslation } from "react-i18next";
import { useTestTribute } from "../../hooks/use-admin-settings.ts";
import ss from "../../pages/admin/settings.module.css";
import type { AdminSettings } from "../../types/admin-settings.ts";
import { ActionBtn } from "../ui/action-btn.tsx";
import { InlineFeedback } from "../ui/inline-feedback.tsx";
import { CommerceActivity } from "./commerce-activity.tsx";
import { CommerceRulesConfig } from "./commerce-rules-config.tsx";
import {
	SettingsDivider,
	SettingsInlineNotice,
	SettingsPanel,
	SettingsStatusRow,
} from "./settings-surface.tsx";
import { SponsorOffersConfig } from "./sponsor-offers-config.tsx";
import { TributePaymentDestinations } from "./tribute-payment-destinations.tsx";

interface TributeConfigProps {
	settings: AdminSettings;
}

export const TributeConfig: FC<TributeConfigProps> = ({ settings }) => {
	const { t } = useTranslation();
	const testMutation = useTestTribute();
	const configured = settings.tributeCredentialsConfigured;
	const connection = testMutation.data;
	const connectionText = !configured
		? t("settings.tribute.keyRequired")
		: connection?.ok
			? t("settings.tribute.connected")
			: connection
				? t("settings.tribute.testFailed")
				: t("settings.tribute.notTested");
	const connectionTone =
		!configured || (connection && !connection.ok)
			? "negative"
			: connection?.ok
				? "positive"
				: "default";
	const checkFailed = testMutation.isError || connection?.ok === false;

	return (
		<div className={ss.formPage}>
			<SettingsPanel title={t("settings.tribute.connectionSection")}>
				<SettingsStatusRow
					label={t("settings.tribute.apiKeyLabel")}
					status={
						configured
							? t("settings.tribute.credentialsConfigured")
							: t("settings.tribute.credentialsMissing")
					}
					tone={configured ? "positive" : "negative"}
					description={t("settings.tribute.apiKeyHint")}
				/>
				{!configured && (
					<>
						<SettingsDivider />
						<div className={ss.panelInset}>
							<SettingsInlineNotice icon={<BadgeInfo size={13} aria-hidden="true" />}>
								{t("settings.tribute.credentialsNotice")}
							</SettingsInlineNotice>
						</div>
					</>
				)}
				<SettingsDivider />
				<SettingsStatusRow
					label={t("settings.tribute.apiAccessLabel")}
					status={connectionText}
					tone={connectionTone}
					description={t("settings.tribute.apiAccessHint")}
					action={
						<ActionBtn
							onClick={() => testMutation.mutate()}
							loading={testMutation.isPending}
							disabled={!configured}
							variant="action"
							size="md"
						>
							{t("settings.tribute.test")}
						</ActionBtn>
					}
				/>
			</SettingsPanel>
			{checkFailed && <InlineFeedback>{t("settings.tribute.testError")}</InlineFeedback>}

			<TributePaymentDestinations settings={settings} />
			<CommerceRulesConfig />
			<SponsorOffersConfig settings={settings} />
			<CommerceActivity executionEnabled={settings.tributeEntitlementExecutionEnabled} />

			<SettingsPanel title={t("settings.tribute.deliverySection")}>
				<SettingsStatusRow
					label={t("settings.tribute.receiverLabel")}
					status={t("settings.tribute.receiverActive")}
					tone="positive"
					description={t("settings.tribute.receiverHint")}
				/>
				<SettingsDivider />
				<SettingsStatusRow
					label={t("settings.tribute.executorLabel")}
					status={
						settings.tributeEntitlementExecutionEnabled
							? t("settings.tribute.executorEnabled")
							: t("settings.tribute.executorDisabled")
					}
					tone={settings.tributeEntitlementExecutionEnabled ? "positive" : "warning"}
					description={t("settings.tribute.executorHint")}
				/>
				<SettingsDivider />
				<SettingsStatusRow
					label={t("settings.tribute.donationAutomationLabel")}
					status={
						settings.tributeIdentifiedDonationAutomationEnabled
							? t("settings.tribute.donationAutomationEnabled")
							: t("settings.tribute.donationAutomationReview")
					}
					tone={settings.tributeIdentifiedDonationAutomationEnabled ? "positive" : "warning"}
					description={t("settings.tribute.donationAutomationHint")}
				/>
				<SettingsDivider />
				<SettingsStatusRow
					label={t("settings.tribute.signatureLabel")}
					status={t("settings.tribute.signatureValue")}
					description={t("settings.tribute.signatureHint")}
				/>
			</SettingsPanel>
		</div>
	);
};
