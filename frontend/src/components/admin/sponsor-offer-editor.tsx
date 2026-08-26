import { type FormEvent, lazy, Suspense, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	useCommerceCatalog,
	useDeleteSponsorOffer,
	useSaveSponsorOffer,
	useSponsorOfferOptions,
} from "../../hooks/use-commerce-rules.ts";
import { localeLabel, SUPPORTED_LOCALES } from "../../i18n";
import { TRIBUTE_PERIOD_KEYS } from "../../lib/commerce-labels.ts";
import { getLocalizedError } from "../../lib/error-copy.ts";
import { majorToMinor, minorToMajorInput } from "../../lib/money.ts";
import {
	PAYMENT_DESTINATION_ISSUE_KEYS,
	paymentDestinationIssue,
} from "../../lib/payment-destination.ts";
import type {
	CommerceRule,
	SponsorDonationPaymentMode,
	SponsorOffer,
	SponsorOfferInput,
	SponsorOfferLocale,
	TributeDonationPeriod,
} from "../../types/commerce.ts";
import { SubscriptionBillingList } from "../commerce/subscription-billing-list.tsx";
import { TemplateVariables } from "../content/template-variables.tsx";
import { ActionBtn } from "../ui/action-btn.tsx";
import { ConfirmDialog } from "../ui/confirm-dialog.tsx";
import { EditorDialog } from "../ui/editor-dialog.tsx";
import {
	FormField,
	FormFieldInput,
	FormFieldSelect,
	FormSurfaceBody,
} from "../ui/form-section.tsx";
import { InlineFeedback } from "../ui/inline-feedback.tsx";
import { EditorSkeleton } from "../ui/page-skeleton.tsx";
import { SegmentedControl } from "../ui/segmented-control.tsx";
import { Skeleton } from "../ui/skeleton.tsx";
import { Toggle } from "../ui/toggle.tsx";
import editorStyles from "./commerce-rule-editor.module.css";
import { canPublishSponsorOffer, hasPublishedSubscriptionOffer } from "./sponsor-offer-logic.ts";
import offerStyles from "./sponsor-offers-config.module.css";

const FormattedTextEditor = lazy(async () => {
	const module = await import("../content/formatted-text-editor.tsx");
	return { default: module.FormattedTextEditor };
});

interface OfferDraft {
	contentLocales: Record<string, SponsorOfferLocale>;
	excludedRemnawaveTags: string[];
	commerceRuleId: string;
	checkoutUrl: string;
	amountMajor: string;
	expectedPaymentMode: SponsorDonationPaymentMode;
	expectedProviderPeriod: TributeDonationPeriod;
	sortOrder: string;
	isPublished: boolean;
}

const DONATION_PERIODS: TributeDonationPeriod[] = [
	"weekly",
	"monthly",
	"quarterly",
	"halfyearly",
	"yearly",
];

function initialDonationMode(rule: CommerceRule | undefined): SponsorDonationPaymentMode {
	return rule?.paymentMode === "recurring" ? "recurring" : "one_time";
}

function initialDraft(
	offer: SponsorOffer | null,
	rules: CommerceRule[],
	defaultLocale: string,
): OfferDraft {
	const contentLocales = offer
		? structuredClone(offer.contentLocales ?? {})
		: Object.fromEntries(
				SUPPORTED_LOCALES.map((locale) => [locale, { title: "", description: "" }]),
			);
	if (offer && !contentLocales[defaultLocale]) {
		contentLocales[defaultLocale] = { title: offer.title, description: offer.description };
	}
	return offer
		? {
				contentLocales,
				excludedRemnawaveTags: [...(offer.excludedRemnawaveTags ?? [])],
				commerceRuleId: offer.commerceRuleId,
				checkoutUrl: offer.commerceType === "donation" ? (offer.checkoutUrl ?? "") : "",
				amountMajor:
					offer.expectedAmountMinor === null
						? ""
						: minorToMajorInput(
								offer.expectedAmountMinor,
								offer.priceOptions[0]?.currency ?? "RUB",
							),
				expectedPaymentMode: offer.expectedPaymentMode ?? "one_time",
				expectedProviderPeriod: offer.expectedProviderPeriod ?? "monthly",
				sortOrder: String(offer.sortOrder),
				isPublished: offer.isPublished,
			}
		: {
				contentLocales,
				excludedRemnawaveTags: [],
				commerceRuleId: rules[0]?.id ?? "",
				checkoutUrl: "",
				amountMajor: "",
				expectedPaymentMode: initialDonationMode(rules[0]),
				expectedProviderPeriod: "monthly",
				sortOrder: "100",
				isPublished: false,
			};
}

interface SponsorOfferEditorProps {
	offer: SponsorOffer | null;
	rules: CommerceRule[];
	offers: SponsorOffer[];
	subscriptionUrls: Record<string, string>;
	contentDefaultLocale: string;
	templateVariables: string[];
	returnFocusTo: HTMLElement | null;
	onClose: () => void;
}

export function SponsorOfferEditor({
	offer,
	rules,
	offers,
	subscriptionUrls,
	contentDefaultLocale,
	templateVariables,
	returnFocusTo,
	onClose,
}: SponsorOfferEditorProps) {
	const { t, i18n } = useTranslation();
	const [draft, setDraft] = useState(() => initialDraft(offer, rules, contentDefaultLocale));
	const [locale, setLocale] = useState(
		SUPPORTED_LOCALES.includes(contentDefaultLocale)
			? contentDefaultLocale
			: (SUPPORTED_LOCALES[0] ?? "en"),
	);
	const [confirmDelete, setConfirmDelete] = useState(false);
	const deleteTriggerRef = useRef<HTMLButtonElement>(null);
	const save = useSaveSponsorOffer();
	const remove = useDeleteSponsorOffer();
	const catalog = useCommerceCatalog();
	const offerOptions = useSponsorOfferOptions();
	const selectedRule = rules.find((rule) => rule.id === draft.commerceRuleId);
	const selectedSubscription = catalog.data?.subscriptions.find(
		(subscription) => subscription.externalItemId === selectedRule?.externalItemId,
	);
	const remnawaveTags = Array.from(
		new Set([...(offerOptions.data?.remnawaveTags ?? []), ...draft.excludedRemnawaveTags]),
	);
	const selectableRules = offer
		? rules
		: rules.filter(
				(rule) =>
					rule.commerceType === "donation" ||
					!offers.some(
						(existing) =>
							existing.commerceType === "subscription" &&
							existing.externalItemId === rule.externalItemId,
					),
			);
	const sortOrder = /^\d+$/.test(draft.sortOrder) ? Number(draft.sortOrder) : 0;
	const isDonation = selectedRule?.commerceType === "donation";
	const subscriptionDestination = selectedRule?.externalItemId
		? subscriptionUrls[selectedRule.externalItemId]
		: undefined;
	const subscriptionDestinationConfigured = Boolean(
		subscriptionDestination?.trim() && paymentDestinationIssue(subscriptionDestination) === null,
	);
	const checkoutIssue = paymentDestinationIssue(draft.checkoutUrl);
	const amountMinor = selectedRule ? majorToMinor(draft.amountMajor, selectedRule.currency) : null;
	const donationDestinationEmpty = !draft.checkoutUrl.trim() && !draft.amountMajor.trim();
	const donationScheduleCompatible = Boolean(
		selectedRule &&
			(selectedRule.paymentMode === "any" ||
				selectedRule.paymentMode === draft.expectedPaymentMode),
	);
	const donationDestinationComplete = Boolean(
		draft.checkoutUrl.trim() &&
			checkoutIssue === null &&
			amountMinor !== null &&
			amountMinor > 0 &&
			draft.expectedPaymentMode &&
			(draft.expectedPaymentMode === "one_time" || draft.expectedProviderPeriod) &&
			donationScheduleCompatible,
	);
	const donationDestinationValid =
		!isDonation || donationDestinationEmpty || donationDestinationComplete;
	const duplicateSubscription = Boolean(
		selectedRule?.commerceType === "subscription" &&
			hasPublishedSubscriptionOffer(offers, selectedRule.externalItemId, offer?.id),
	);
	const publishReady =
		!duplicateSubscription &&
		canPublishSponsorOffer(
			selectedRule,
			donationDestinationComplete,
			subscriptionDestinationConfigured,
		);
	const localizedDraftValid = SUPPORTED_LOCALES.every((key) => {
		const localized = draft.contentLocales[key];
		return (
			localized &&
			localized.title.trim().length >= 1 &&
			localized.title.trim().length <= 100 &&
			localized.description.trim().length <= 300
		);
	});
	const valid =
		localizedDraftValid &&
		Boolean(selectedRule) &&
		Number.isSafeInteger(sortOrder) &&
		sortOrder >= 1 &&
		sortOrder <= 10_000 &&
		donationDestinationValid &&
		(!draft.isPublished || publishReady);
	const busy = save.isPending || remove.isPending;

	const submit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!valid) return;
		const localized = structuredClone(draft.contentLocales);
		for (const key of SUPPORTED_LOCALES) {
			localized[key] = {
				title: draft.contentLocales[key]?.title.trim() ?? "",
				description: draft.contentLocales[key]?.description.trim() ?? "",
			};
		}
		const defaultContent = localized[contentDefaultLocale] ?? localized[SUPPORTED_LOCALES[0]];
		if (!defaultContent) return;
		const input: SponsorOfferInput = {
			title: defaultContent.title,
			description: defaultContent.description,
			contentLocales: localized,
			excludedRemnawaveTags: draft.excludedRemnawaveTags,
			commerceRuleId: draft.commerceRuleId,
			checkoutUrl: isDonation ? draft.checkoutUrl.trim() || null : null,
			expectedAmountMinor: isDonation ? amountMinor : null,
			expectedPaymentMode: isDonation ? draft.expectedPaymentMode : null,
			expectedProviderPeriod:
				isDonation && draft.expectedPaymentMode === "recurring"
					? draft.expectedProviderPeriod
					: null,
			isPublished: draft.isPublished,
			sortOrder,
		};
		save.mutate({ id: offer?.id, input }, { onSuccess: onClose });
	};

	return (
		<>
			<EditorDialog
				eyebrow={t("settings.tribute.offers.editorEyebrow")}
				title={
					offer ? t("settings.tribute.offers.editTitle") : t("settings.tribute.offers.createTitle")
				}
				subtitle={t("settings.tribute.offers.editorSubtitle")}
				closeLabel={t("settings.tribute.offers.closeEditor")}
				busy={busy}
				returnFocusTo={returnFocusTo}
				onClose={onClose}
				onSubmit={submit}
				telegramFooter={{
					primaryText: offer
						? t("settings.tribute.offers.saveAction")
						: t("settings.tribute.offers.createAction"),
					primaryDisabled: !valid,
					primaryVisible: !confirmDelete,
				}}
			>
				{save.isError && (
					<InlineFeedback attention="action">
						{getLocalizedError(save.error, "settings.tribute.offers.saveError")}
					</InlineFeedback>
				)}

				<section className={editorStyles.card} aria-labelledby="sponsor-offer-copy-title">
					<h3 id="sponsor-offer-copy-title" className={editorStyles.cardTitle}>
						{t("settings.tribute.offers.presentationSection")}
					</h3>
					<FormSurfaceBody dataUi="sponsor-offer-fields">
						<FormField label={t("settings.content.languageLabel")}>
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
						<FormField
							label={t("settings.tribute.offers.titleLabel")}
							htmlFor="sponsor-offer-title"
						>
							<FormFieldInput
								id="sponsor-offer-title"
								value={draft.contentLocales[locale]?.title ?? ""}
								enterKeyHint="next"
								maxLength={100}
								placeholder={t("settings.tribute.offers.titlePlaceholder")}
								onChange={(event) =>
									setDraft({
										...draft,
										contentLocales: {
											...draft.contentLocales,
											[locale]: {
												title: event.target.value,
												description: draft.contentLocales[locale]?.description ?? "",
											},
										},
									})
								}
							/>
						</FormField>
						<FormField
							label={t("settings.tribute.offers.descriptionLabel")}
							htmlFor="sponsor-offer-description"
							hint={t("settings.tribute.offers.descriptionHint")}
						>
							<Suspense fallback={<EditorSkeleton />}>
								<FormattedTextEditor
									id="sponsor-offer-description"
									ariaLabel={t("settings.tribute.offers.descriptionLabel")}
									value={draft.contentLocales[locale]?.description ?? ""}
									maxLength={300}
									placeholder={t("settings.tribute.offers.descriptionPlaceholder")}
									onChange={(description) =>
										setDraft({
											...draft,
											contentLocales: {
												...draft.contentLocales,
												[locale]: {
													title: draft.contentLocales[locale]?.title ?? "",
													description,
												},
											},
										})
									}
								/>
							</Suspense>
							<TemplateVariables
								variables={templateVariables}
								scopes={{
									appName: [
										t("settings.tribute.offers.titleLabel"),
										t("settings.tribute.offers.descriptionLabel"),
									],
								}}
							/>
						</FormField>
					</FormSurfaceBody>
				</section>

				<section className={editorStyles.card} aria-labelledby="sponsor-offer-delivery-title">
					<h3 id="sponsor-offer-delivery-title" className={editorStyles.cardTitle}>
						{t("settings.tribute.offers.deliverySection")}
					</h3>
					<FormSurfaceBody dataUi="sponsor-offer-fields">
						<FormField
							label={t("settings.tribute.offers.ruleLabel")}
							htmlFor="sponsor-offer-rule"
							hint={t("settings.tribute.offers.ruleHint")}
						>
							<FormFieldSelect
								id="sponsor-offer-rule"
								value={draft.commerceRuleId}
								disabled={busy || selectableRules.length === 0}
								options={selectableRules.map((rule) => ({ value: rule.id, label: rule.name }))}
								onChange={(event) => {
									const nextRule = rules.find((rule) => rule.id === event.target.value);
									setDraft({
										...draft,
										commerceRuleId: event.target.value,
										expectedPaymentMode: initialDonationMode(nextRule),
									});
								}}
							/>
						</FormField>
						<FormField
							label={t("settings.tribute.offers.excludedTagsLabel")}
							hint={t("settings.tribute.offers.excludedTagsHint")}
							notice={
								offerOptions.isError ? (
									<span role="alert">{t("settings.tribute.offers.excludedTagsUnavailable")}</span>
								) : undefined
							}
						>
							{offerOptions.isPending ? (
								<Skeleton width="100%" height={44} radius={8} />
							) : remnawaveTags.length > 0 ? (
								<fieldset className={offerStyles.tagChecks}>
									<legend className={offerStyles.srOnly}>
										{t("settings.tribute.offers.excludedTagsLabel")}
									</legend>
									{remnawaveTags.map((tag) => (
										<label key={tag}>
											<input
												type="checkbox"
												checked={draft.excludedRemnawaveTags.includes(tag)}
												onChange={(event) =>
													setDraft({
														...draft,
														excludedRemnawaveTags: event.target.checked
															? [...draft.excludedRemnawaveTags, tag]
															: draft.excludedRemnawaveTags.filter((selected) => selected !== tag),
													})
												}
											/>
											<span>{tag}</span>
										</label>
									))}
								</fieldset>
							) : (
								<p className={offerStyles.emptyTags}>
									{t("settings.tribute.offers.excludedTagsEmpty")}
								</p>
							)}
						</FormField>
						{selectedSubscription && (
							<div className={`${editorStyles.providerExpiry} ${offerStyles.editorPeriods}`}>
								<strong>{t("settings.tribute.offers.subscriptionPeriodsTitle")}</strong>
								<SubscriptionBillingList
									options={selectedSubscription.periods.map((period) => ({
										priceMajor: period.priceMajor,
										currency: selectedSubscription.currency,
										period: period.period,
									}))}
									tone="plain"
								/>
								<span>{t("settings.tribute.offers.subscriptionPeriodsHint")}</span>
							</div>
						)}
						{isDonation && (
							<>
								<FormField
									label={t("settings.tribute.offers.donationLinkLabel")}
									htmlFor="sponsor-offer-checkout-url"
									hint={t("settings.tribute.offers.donationLinkHint")}
									notice={
										checkoutIssue ? (
											<span id="sponsor-offer-checkout-url-error" role="alert">
												{t(PAYMENT_DESTINATION_ISSUE_KEYS[checkoutIssue])}
											</span>
										) : undefined
									}
								>
									<FormFieldInput
										id="sponsor-offer-checkout-url"
										type="url"
										inputMode="url"
										enterKeyHint="next"
										value={draft.checkoutUrl}
										placeholder={t("settings.tribute.destinations.placeholder")}
										autoCapitalize="none"
										autoCorrect="off"
										spellCheck={false}
										aria-invalid={checkoutIssue ? true : undefined}
										aria-describedby={
											checkoutIssue ? "sponsor-offer-checkout-url-error" : undefined
										}
										onChange={(event) => setDraft({ ...draft, checkoutUrl: event.target.value })}
									/>
								</FormField>
								<FormField
									label={t("settings.tribute.offers.expectedAmountLabel", {
										currency: selectedRule.currency,
									})}
									htmlFor="sponsor-offer-expected-amount"
									hint={t("settings.tribute.offers.expectedAmountHint")}
									notice={
										draft.amountMajor.trim() && (amountMinor === null || amountMinor <= 0) ? (
											<span id="sponsor-offer-expected-amount-error" role="alert">
												{t("settings.tribute.offers.expectedAmountInvalid")}
											</span>
										) : undefined
									}
								>
									<FormFieldInput
										id="sponsor-offer-expected-amount"
										type="number"
										inputMode="decimal"
										enterKeyHint="next"
										min="0.01"
										step="0.01"
										value={draft.amountMajor}
										aria-invalid={
											draft.amountMajor.trim() && (amountMinor === null || amountMinor <= 0)
												? true
												: undefined
										}
										aria-describedby={
											draft.amountMajor.trim() && (amountMinor === null || amountMinor <= 0)
												? "sponsor-offer-expected-amount-error"
												: undefined
										}
										onChange={(event) => setDraft({ ...draft, amountMajor: event.target.value })}
									/>
								</FormField>
								<FormField
									label={t("settings.tribute.offers.paymentModeLabel")}
									hint={t("settings.tribute.offers.paymentModeHint")}
								>
									<SegmentedControl
										ariaLabel={t("settings.tribute.offers.paymentModeLabel")}
										value={draft.expectedPaymentMode}
										options={[
											{
												key: "one_time",
												label: t("settings.tribute.offers.paymentModeOneTime"),
											},
											{
												key: "recurring",
												label: t("settings.tribute.offers.paymentModeRecurring"),
											},
										]}
										onChange={(value) =>
											setDraft({
												...draft,
												expectedPaymentMode: value as SponsorDonationPaymentMode,
											})
										}
									/>
								</FormField>
								{draft.expectedPaymentMode === "recurring" && (
									<FormField
										label={t("settings.tribute.offers.providerPeriodLabel")}
										htmlFor="sponsor-offer-provider-period"
										hint={t("settings.tribute.offers.providerPeriodHint")}
									>
										<FormFieldSelect
											id="sponsor-offer-provider-period"
											value={draft.expectedProviderPeriod}
											options={DONATION_PERIODS.map((period) => ({
												value: period,
												label: t(TRIBUTE_PERIOD_KEYS[period]),
											}))}
											onChange={(event) =>
												setDraft({
													...draft,
													expectedProviderPeriod: event.target.value as TributeDonationPeriod,
												})
											}
										/>
									</FormField>
								)}
							</>
						)}
						<FormField
							label={t("settings.tribute.offers.sortOrderLabel")}
							htmlFor="sponsor-offer-sort-order"
							hint={t("settings.tribute.offers.sortOrderHint")}
						>
							<FormFieldInput
								id="sponsor-offer-sort-order"
								type="number"
								inputMode="numeric"
								enterKeyHint="done"
								min="1"
								max="10000"
								value={draft.sortOrder}
								onChange={(event) => setDraft({ ...draft, sortOrder: event.target.value })}
							/>
						</FormField>
						<div className={editorStyles.providerExpiry}>
							<strong>{t("settings.tribute.offers.publishTitle")}</strong>
							<span id="sponsor-offer-publish-hint">
								{publishReady
									? t("settings.tribute.offers.publishHint")
									: t(
											duplicateSubscription
												? "settings.tribute.offers.publishDuplicateSubscription"
												: selectedRule?.commerceType === "subscription" &&
														!subscriptionDestinationConfigured
													? "settings.tribute.offers.publishMissingSubscriptionDestination"
													: "settings.tribute.offers.publishUnavailable",
										)}
							</span>
							<Toggle
								checked={draft.isPublished}
								disabled={!draft.isPublished && duplicateSubscription}
								ariaDisabled={!draft.isPublished && !duplicateSubscription && !publishReady}
								ariaDescribedBy="sponsor-offer-publish-hint"
								ariaLabel={t("settings.tribute.offers.publishLabel")}
								onChange={(isPublished) => setDraft({ ...draft, isPublished })}
							/>
						</div>
					</FormSurfaceBody>
				</section>

				{offer && (
					<section className={editorStyles.dangerZone}>
						<div>
							<strong>{t("settings.tribute.offers.deleteTitle")}</strong>
							<span>{t("settings.tribute.offers.deleteHint")}</span>
						</div>
						<ActionBtn
							ref={deleteTriggerRef}
							variant="dangerOutline"
							size="sm"
							onClick={() => {
								remove.reset();
								setConfirmDelete(true);
							}}
						>
							{t("settings.tribute.offers.deleteAction")}
						</ActionBtn>
					</section>
				)}
			</EditorDialog>

			<ConfirmDialog
				open={confirmDelete}
				title={t("settings.tribute.offers.deleteConfirmTitle")}
				confirmLabel={t("settings.tribute.offers.deleteAction")}
				cancelLabel={t("access.cancel")}
				telegramNativeMessage={
					remove.isError
						? `${getLocalizedError(remove.error, "settings.tribute.offers.deleteError")}\n\n${t(
								"settings.tribute.offers.deleteConfirmBody",
								{ name: offer?.title },
							)}`
						: t("settings.tribute.offers.deleteConfirmBody", { name: offer?.title })
				}
				confirmVariant="danger"
				confirmLoading={remove.isPending}
				returnFocusRef={deleteTriggerRef}
				onCancel={() => {
					remove.reset();
					setConfirmDelete(false);
				}}
				onConfirm={() => {
					if (!offer) return;
					remove.mutate(offer.id, { onSuccess: onClose });
				}}
			>
				{t("settings.tribute.offers.deleteConfirmBody", { name: offer?.title })}
				{remove.isError && (
					<InlineFeedback attention="action">
						{getLocalizedError(remove.error, "settings.tribute.offers.deleteError")}
					</InlineFeedback>
				)}
			</ConfirmDialog>
		</>
	);
}
