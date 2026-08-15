import { useBlocker } from "@tanstack/react-router";
import { BadgeInfo } from "lucide-react";
import { type FC, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUpdateSettings } from "../../hooks/use-admin-settings.ts";
import { useCommerceCatalog } from "../../hooks/use-commerce-rules.ts";
import { formatMajorMoney } from "../../lib/money.ts";
import {
	PAYMENT_DESTINATION_ISSUE_KEYS,
	compactPaymentDestinations,
	paymentDestinationIssue,
} from "../../lib/payment-destination.ts";
import type { AdminSettings } from "../../types/admin-settings.ts";
import { ActionBtn } from "../ui/action-btn.tsx";
import { ConfirmDialog } from "../ui/confirm-dialog.tsx";
import { FormSaveButton } from "../ui/form-save-button.tsx";
import { FormField, FormFieldInput } from "../ui/form-section.tsx";
import { InlineFeedback } from "../ui/inline-feedback.tsx";
import { SettingsFields, SettingsInlineNotice, SettingsPanel } from "./settings-surface.tsx";
import styles from "./tribute-payment-destinations.module.css";

interface TributePaymentDestinationsProps {
	settings: AdminSettings;
}

function sameDestinations(left: Record<string, string>, right: Record<string, string>): boolean {
	const leftEntries = Object.entries(left).sort(([leftId], [rightId]) =>
		leftId.localeCompare(rightId),
	);
	const rightEntries = Object.entries(right).sort(([leftId], [rightId]) =>
		leftId.localeCompare(rightId),
	);
	return JSON.stringify(leftEntries) === JSON.stringify(rightEntries);
}

export const TributePaymentDestinations: FC<TributePaymentDestinationsProps> = ({ settings }) => {
	const { t, i18n } = useTranslation();
	const catalogQuery = useCommerceCatalog();
	const updateMutation = useUpdateSettings();
	const [subscriptionUrls, setSubscriptionUrls] = useState<Record<string, string>>(() => ({
		...settings.tributeSubscriptionUrls,
	}));
	const [saved, setSaved] = useState(false);
	const [saveFailed, setSaveFailed] = useState(false);

	const initialSubscriptionUrls = settings.tributeSubscriptionUrls;
	const compactUrls = compactPaymentDestinations(subscriptionUrls);
	const dirty = !sameDestinations(compactUrls, initialSubscriptionUrls);
	const subscriptionIssues = Object.fromEntries(
		Object.entries(subscriptionUrls)
			.map(([id, url]) => [id, paymentDestinationIssue(url)] as const)
			.filter((entry) => entry[1] !== null),
	);
	const hasValidationError = Object.keys(subscriptionIssues).length > 0;

	const catalogIds = useMemo(
		() => new Set(catalogQuery.data?.subscriptions.map((item) => item.externalItemId) ?? []),
		[catalogQuery.data],
	);
	const unavailableIds = catalogQuery.isSuccess
		? Object.keys(subscriptionUrls)
				.filter((id) => !catalogIds.has(id))
				.sort()
		: [];

	const blocker = useBlocker({
		shouldBlockFn: () => dirty && !saved,
		withResolver: true,
	});

	useEffect(() => {
		if (!saved) return;
		const timer = setTimeout(() => setSaved(false), 2000);
		return () => clearTimeout(timer);
	}, [saved]);

	const updateSubscription = (id: string, value: string) => {
		setSubscriptionUrls((current) => ({ ...current, [id]: value }));
		setSaved(false);
		setSaveFailed(false);
	};

	const handleSave = async () => {
		if (hasValidationError) return;
		setSaveFailed(false);
		try {
			const updated = await updateMutation.mutateAsync({
				tributeSubscriptionUrls: compactUrls,
			});
			setSubscriptionUrls({ ...updated.tributeSubscriptionUrls });
			setSaved(true);
		} catch {
			setSaveFailed(true);
		}
	};

	return (
		<>
			{saveFailed && (
				<InlineFeedback>{t("settings.tribute.destinations.saveError")}</InlineFeedback>
			)}
			{saved && (
				<InlineFeedback tone="success">{t("settings.tribute.destinations.saved")}</InlineFeedback>
			)}
			<SettingsPanel title={t("settings.tribute.destinations.section")}>
				<div className={styles.intro}>
					<SettingsInlineNotice icon={<BadgeInfo size={13} aria-hidden="true" />}>
						{t("settings.tribute.destinations.intro")}
					</SettingsInlineNotice>
				</div>
				<SettingsFields>
					<div className={styles.subheading}>
						<strong>{t("settings.tribute.destinations.subscriptions")}</strong>
						<small>{t("settings.tribute.destinations.subscriptionsHint")}</small>
					</div>
					{catalogQuery.isPending && (
						<output className={styles.catalogState}>
							{t("settings.tribute.destinations.loading")}
						</output>
					)}
					{catalogQuery.isError && (
						<div className={styles.catalogError}>
							<InlineFeedback>{t("settings.tribute.destinations.catalogError")}</InlineFeedback>
							<ActionBtn variant="action" size="sm" onClick={() => void catalogQuery.refetch()}>
								{t("common.retry")}
							</ActionBtn>
						</div>
					)}
					{catalogQuery.isSuccess && catalogQuery.data.subscriptions.length === 0 && (
						<p className={styles.catalogState}>{t("settings.tribute.destinations.empty")}</p>
					)}
					{catalogQuery.data?.subscriptions.map((subscription) => {
						const inputId = `tribute-subscription-url-${subscription.externalItemId}`;
						const issue = subscriptionIssues[subscription.externalItemId] ?? null;
						const prices = subscription.periods
							.map(
								(period) =>
									`${formatMajorMoney(period.priceMajor, subscription.currency, i18n.language)} / ${t(
										`settings.tribute.rules.period.${period.period}`,
									)}`,
							)
							.join(" · ");
						return (
							<FormField
								key={subscription.externalItemId}
								label={subscription.name}
								htmlFor={inputId}
								hint={prices}
								notice={
									issue ? (
										<span id={`${inputId}-error`} className={styles.fieldError} role="alert">
											{t(PAYMENT_DESTINATION_ISSUE_KEYS[issue])}
										</span>
									) : undefined
								}
							>
								<FormFieldInput
									id={inputId}
									type="url"
									inputMode="url"
									value={subscriptionUrls[subscription.externalItemId] ?? ""}
									onChange={(event) =>
										updateSubscription(subscription.externalItemId, event.target.value)
									}
									placeholder={t("settings.tribute.destinations.placeholder")}
									autoCapitalize="none"
									autoCorrect="off"
									spellCheck={false}
									aria-invalid={issue ? true : undefined}
									aria-describedby={issue ? `${inputId}-error` : undefined}
								/>
							</FormField>
						);
					})}
					{unavailableIds.map((id) => {
						const inputId = `tribute-subscription-url-${id}`;
						const issue = subscriptionIssues[id] ?? null;
						return (
							<FormField
								key={id}
								label={t("settings.tribute.destinations.unavailable", { id })}
								htmlFor={inputId}
								hint={t("settings.tribute.destinations.unavailableHint")}
								notice={
									issue ? (
										<span id={`${inputId}-error`} className={styles.fieldError} role="alert">
											{t(PAYMENT_DESTINATION_ISSUE_KEYS[issue])}
										</span>
									) : undefined
								}
							>
								<FormFieldInput
									id={inputId}
									type="url"
									inputMode="url"
									value={subscriptionUrls[id] ?? ""}
									onChange={(event) => updateSubscription(id, event.target.value)}
									placeholder={t("settings.tribute.destinations.placeholder")}
									autoCapitalize="none"
									autoCorrect="off"
									spellCheck={false}
									aria-invalid={issue ? true : undefined}
									aria-describedby={issue ? `${inputId}-error` : undefined}
								/>
							</FormField>
						);
					})}
				</SettingsFields>
			</SettingsPanel>

			<FormSaveButton
				dirty={dirty && !saved}
				disabled={hasValidationError}
				loading={updateMutation.isPending}
				label={t("settings.tribute.destinations.saveAction")}
				onSave={handleSave}
			/>

			<ConfirmDialog
				open={blocker.status === "blocked"}
				title={t("settings.tribute.destinations.discardTitle")}
				confirmLabel={t("settings.tribute.destinations.discardConfirm")}
				cancelLabel={t("settings.tribute.destinations.discardCancel")}
				onConfirm={() => blocker.proceed?.()}
				onCancel={() => blocker.reset?.()}
			>
				<p>{t("settings.tribute.destinations.discardBody")}</p>
			</ConfirmDialog>
		</>
	);
};
