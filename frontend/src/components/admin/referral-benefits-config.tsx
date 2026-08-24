import { useBlocker } from "@tanstack/react-router";
import { BadgeInfo } from "lucide-react";
import { type FC, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUpdateSettings } from "../../hooks/use-admin-settings.ts";
import { useSponsorOffers } from "../../hooks/use-commerce-rules.ts";
import { useAccessProfiles } from "../../hooks/use-registration-admin.ts";
import {
	PAYMENT_DESTINATION_ISSUE_KEYS,
	paymentDestinationIssue,
} from "../../lib/payment-destination.ts";
import type { AdminSettings } from "../../types/admin-settings.ts";
import { ActionBtn } from "../ui/action-btn.tsx";
import { ConfirmDialog } from "../ui/confirm-dialog.tsx";
import { FormSaveButton } from "../ui/form-save-button.tsx";
import { FormField, FormFieldInput, FormFieldSelect } from "../ui/form-section.tsx";
import { InlineFeedback } from "../ui/inline-feedback.tsx";
import { Toggle } from "../ui/toggle.tsx";
import styles from "./referral-benefits-config.module.css";
import {
	SettingsDivider,
	SettingsFields,
	SettingsInlineNotice,
	SettingsPanel,
	SettingsStatusRow,
} from "./settings-surface.tsx";

interface ReferralBenefitsConfigProps {
	settings: AdminSettings;
}

export const ReferralBenefitsConfig: FC<ReferralBenefitsConfigProps> = ({ settings }) => {
	const { t } = useTranslation();
	const update = useUpdateSettings();
	const profiles = useAccessProfiles();
	const offers = useSponsorOffers();
	const [rewardEnabled, setRewardEnabled] = useState(settings.referralRewardEnabled);
	const [rewardDays, setRewardDays] = useState(
		settings.referralRewardDays === null ? "" : String(settings.referralRewardDays),
	);
	const [rewardProfileId, setRewardProfileId] = useState(
		settings.referralRewardAccessProfileId ?? "",
	);
	const [discountEnabled, setDiscountEnabled] = useState(settings.welcomeDiscountEnabled);
	const [discountOfferId, setDiscountOfferId] = useState(settings.welcomeDiscountOfferId ?? "");
	const [discountUrl, setDiscountUrl] = useState(settings.welcomeDiscountUrl ?? "");
	const [discountPercent, setDiscountPercent] = useState(
		settings.welcomeDiscountPercent === null ? "" : String(settings.welcomeDiscountPercent),
	);
	const [saveFailed, setSaveFailed] = useState(false);

	const automationProfiles = useMemo(
		() =>
			(profiles.data ?? []).filter(
				(profile) =>
					profile.isActive && profile.validityMode === "automation" && profile.status === "ACTIVE",
			),
		[profiles.data],
	);
	const subscriptionOffers = useMemo(
		() =>
			(offers.data ?? []).filter(
				(offer) =>
					offer.isPublished &&
					offer.availability === "ready" &&
					offer.commerceType === "subscription",
			),
		[offers.data],
	);
	const daysNumber = Number(rewardDays);
	const daysInvalid =
		rewardEnabled && (!/^\d+$/.test(rewardDays) || daysNumber < 1 || daysNumber > 3650);
	const promoIssue = discountEnabled ? paymentDestinationIssue(discountUrl) : null;
	const discountPercentNumber = Number(discountPercent);
	const discountPercentInvalid =
		discountEnabled &&
		(!/^\d+$/.test(discountPercent) || discountPercentNumber < 1 || discountPercentNumber > 99);
	const invalid =
		daysInvalid ||
		discountPercentInvalid ||
		(rewardEnabled && !rewardProfileId) ||
		(discountEnabled && (!discountOfferId || promoIssue !== null));
	const dirty =
		rewardEnabled !== settings.referralRewardEnabled ||
		(rewardEnabled && daysNumber !== settings.referralRewardDays) ||
		(rewardEnabled && rewardProfileId !== (settings.referralRewardAccessProfileId ?? "")) ||
		discountEnabled !== settings.welcomeDiscountEnabled ||
		(discountEnabled && discountOfferId !== (settings.welcomeDiscountOfferId ?? "")) ||
		(discountEnabled && discountUrl.trim() !== (settings.welcomeDiscountUrl ?? "")) ||
		(discountEnabled && discountPercentNumber !== settings.welcomeDiscountPercent);

	const blocker = useBlocker({
		shouldBlockFn: () => dirty,
		enableBeforeUnload: dirty,
		withResolver: true,
	});

	const save = async () => {
		if (invalid) return;
		setSaveFailed(false);
		try {
			const updated = await update.mutateAsync({
				referralRewardEnabled: rewardEnabled,
				referralRewardDays: rewardEnabled ? daysNumber : null,
				referralRewardAccessProfileId: rewardEnabled ? rewardProfileId : null,
				welcomeDiscountEnabled: discountEnabled,
				welcomeDiscountOfferId: discountEnabled ? discountOfferId : null,
				welcomeDiscountUrl: discountEnabled ? discountUrl.trim() : null,
				welcomeDiscountPercent: discountEnabled ? discountPercentNumber : null,
			});
			setRewardEnabled(updated.referralRewardEnabled);
			setRewardDays(updated.referralRewardDays === null ? "" : String(updated.referralRewardDays));
			setRewardProfileId(updated.referralRewardAccessProfileId ?? "");
			setDiscountEnabled(updated.welcomeDiscountEnabled);
			setDiscountOfferId(updated.welcomeDiscountOfferId ?? "");
			setDiscountUrl(updated.welcomeDiscountUrl ?? "");
			setDiscountPercent(
				updated.welcomeDiscountPercent === null ? "" : String(updated.welcomeDiscountPercent),
			);
		} catch {
			setSaveFailed(true);
		}
	};

	return (
		<>
			{saveFailed && (
				<InlineFeedback attention="action">
					{t("settings.tribute.referrals.saveError")}
				</InlineFeedback>
			)}
			<SettingsPanel title={t("settings.tribute.referrals.section")}>
				<div className={styles.intro}>
					<SettingsInlineNotice icon={<BadgeInfo size={13} aria-hidden="true" />} tone="neutral">
						{t("settings.tribute.referrals.intro")}
					</SettingsInlineNotice>
				</div>
				{(profiles.isError || offers.isError) && (
					<div className={styles.errorState}>
						<InlineFeedback>{t("settings.tribute.referrals.loadError")}</InlineFeedback>
						<ActionBtn
							variant="action"
							size="sm"
							onClick={() => void Promise.all([profiles.refetch(), offers.refetch()])}
						>
							{t("common.retry")}
						</ActionBtn>
					</div>
				)}
				<SettingsStatusRow
					label={t("settings.tribute.referrals.rewardTitle")}
					description={t("settings.tribute.referrals.rewardHint")}
					action={
						<Toggle
							checked={rewardEnabled}
							onChange={(checked) => {
								setRewardEnabled(checked);
								setSaveFailed(false);
							}}
							ariaLabel={t("settings.tribute.referrals.rewardToggle")}
						/>
					}
				/>
				{rewardEnabled && (
					<SettingsFields>
						<FormField
							label={t("settings.tribute.referrals.daysLabel")}
							htmlFor="referral-reward-days"
							hint={t("settings.tribute.referrals.daysHint")}
							notice={
								daysInvalid ? (
									<span className={styles.error} role="alert">
										{t("settings.tribute.referrals.daysInvalid")}
									</span>
								) : undefined
							}
						>
							<FormFieldInput
								id="referral-reward-days"
								type="number"
								inputMode="numeric"
								enterKeyHint="done"
								min={1}
								max={3650}
								value={rewardDays}
								onChange={(event) => setRewardDays(event.target.value)}
								aria-invalid={daysInvalid || undefined}
							/>
						</FormField>
						<FormField
							label={t("settings.tribute.referrals.profileLabel")}
							htmlFor="referral-reward-profile"
							hint={t("settings.tribute.referrals.profileHint")}
						>
							<FormFieldSelect
								id="referral-reward-profile"
								value={rewardProfileId}
								onChange={(event) => setRewardProfileId(event.target.value)}
								options={[
									{ value: "", label: t("settings.tribute.referrals.selectProfile") },
									...automationProfiles.map((profile) => ({
										value: profile.id,
										label: profile.name,
									})),
								]}
							/>
						</FormField>
					</SettingsFields>
				)}
				<SettingsDivider />
				<SettingsStatusRow
					label={t("settings.tribute.referrals.discountTitle")}
					description={t("settings.tribute.referrals.discountHint")}
					action={
						<Toggle
							checked={discountEnabled}
							onChange={(checked) => {
								setDiscountEnabled(checked);
								setSaveFailed(false);
							}}
							ariaLabel={t("settings.tribute.referrals.discountToggle")}
						/>
					}
				/>
				{discountEnabled && (
					<SettingsFields>
						<FormField
							label={t("settings.tribute.referrals.percentLabel")}
							htmlFor="welcome-discount-percent"
							hint={t("settings.tribute.referrals.percentHint")}
							notice={
								discountPercentInvalid ? (
									<span className={styles.error} role="alert">
										{t("settings.tribute.referrals.percentInvalid")}
									</span>
								) : undefined
							}
						>
							<FormFieldInput
								id="welcome-discount-percent"
								type="number"
								inputMode="numeric"
								enterKeyHint="done"
								min={1}
								max={99}
								value={discountPercent}
								onChange={(event) => setDiscountPercent(event.target.value)}
								aria-invalid={discountPercentInvalid || undefined}
							/>
						</FormField>
						<FormField
							label={t("settings.tribute.referrals.offerLabel")}
							htmlFor="welcome-discount-offer"
							hint={t("settings.tribute.referrals.offerHint")}
						>
							<FormFieldSelect
								id="welcome-discount-offer"
								value={discountOfferId}
								onChange={(event) => setDiscountOfferId(event.target.value)}
								options={[
									{ value: "", label: t("settings.tribute.referrals.selectOffer") },
									...subscriptionOffers.map((offer) => ({
										value: offer.id,
										label: offer.title,
									})),
								]}
							/>
						</FormField>
						<FormField
							label={t("settings.tribute.referrals.promoLinkLabel")}
							htmlFor="welcome-discount-url"
							hint={t("settings.tribute.referrals.promoLinkHint")}
							notice={
								promoIssue ? (
									<span className={styles.error} role="alert">
										{t(PAYMENT_DESTINATION_ISSUE_KEYS[promoIssue])}
									</span>
								) : undefined
							}
						>
							<FormFieldInput
								id="welcome-discount-url"
								type="url"
								inputMode="url"
								enterKeyHint="done"
								value={discountUrl}
								onChange={(event) => setDiscountUrl(event.target.value)}
								placeholder={t("settings.tribute.destinations.placeholder")}
								autoCapitalize="none"
								autoCorrect="off"
								spellCheck={false}
								aria-invalid={promoIssue ? true : undefined}
							/>
						</FormField>
					</SettingsFields>
				)}
			</SettingsPanel>

			<FormSaveButton
				dirty={dirty}
				loading={update.isPending}
				disabled={invalid || profiles.isPending || offers.isPending}
				label={t("settings.tribute.referrals.save")}
				onSave={() => void save()}
			/>

			<ConfirmDialog
				open={blocker.status === "blocked"}
				title={t("settings.tribute.referrals.discardTitle")}
				confirmLabel={t("settings.tribute.referrals.discardConfirm")}
				cancelLabel={t("settings.tribute.referrals.discardCancel")}
				telegramNativeMessage={t("settings.tribute.referrals.discardBody")}
				onConfirm={() => blocker.proceed?.()}
				onCancel={() => blocker.reset?.()}
			>
				<p>{t("settings.tribute.referrals.discardBody")}</p>
			</ConfirmDialog>
		</>
	);
};
