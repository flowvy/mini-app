import { ChevronDown, Pencil, Plus } from "lucide-react";
import { type FormEvent, Suspense, lazy, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	useCommerceCatalog,
	useCommerceRules,
	useDeleteSponsorOffer,
	useSaveSponsorOffer,
	useSponsorOffers,
} from "../../hooks/use-commerce-rules.ts";
import { TRIBUTE_PERIOD_KEYS } from "../../lib/commerce-labels.ts";
import { getLocalizedError } from "../../lib/error-copy.ts";
import { formatPlanMoney, majorToMinor, minorToMajorInput } from "../../lib/money.ts";
import {
	PAYMENT_DESTINATION_ISSUE_KEYS,
	paymentDestinationIssue,
} from "../../lib/payment-destination.ts";
import type {
	CommerceRule,
	SponsorDonationPaymentMode,
	SponsorOffer,
	SponsorOfferAvailability,
	SponsorOfferInput,
	SponsorOfferPriceOption,
	TributeDonationPeriod,
} from "../../types/commerce.ts";
import { SubscriptionBillingList } from "../commerce/subscription-billing-list.tsx";
import { FormattedText } from "../content/formatted-text.tsx";
import { ActionBtn } from "../ui/action-btn.tsx";
import { ConfirmDialog } from "../ui/confirm-dialog.tsx";
import { EditorDialog } from "../ui/editor-dialog.tsx";
import { FormField, FormFieldInput, FormFieldSelect } from "../ui/form-section.tsx";
import { InlineFeedback } from "../ui/inline-feedback.tsx";
import { SegmentedControl } from "../ui/segmented-control.tsx";
import { Toggle } from "../ui/toggle.tsx";
import editorStyles from "./commerce-rule-editor.module.css";
import styles from "./commerce-rules-config.module.css";
import { SettingsDivider, SettingsSection } from "./settings-surface.tsx";
import offerStyles from "./sponsor-offers-config.module.css";

const FormattedTextEditor = lazy(async () => {
	const module = await import("../content/formatted-text-editor.tsx");
	return { default: module.FormattedTextEditor };
});

interface EditorState {
	offer: SponsorOffer | null;
	returnFocusTo: HTMLElement | null;
}

interface OfferDraft {
	title: string;
	description: string;
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

const AVAILABILITY_KEYS: Record<SponsorOfferAvailability, string> = {
	draft: "settings.tribute.offers.availability.draft",
	ready: "settings.tribute.offers.availability.ready",
	rule_disabled: "settings.tribute.offers.availability.ruleDisabled",
	profile_unavailable: "settings.tribute.offers.availability.profileUnavailable",
	configuration_changed: "settings.tribute.offers.availability.configurationChanged",
};

function initialDraft(offer: SponsorOffer | null, rules: CommerceRule[]): OfferDraft {
	return offer
		? {
				title: offer.title,
				description: offer.description,
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
				title: "",
				description: "",
				commerceRuleId: rules[0]?.id ?? "",
				checkoutUrl: "",
				amountMajor: "",
				expectedPaymentMode: initialDonationMode(rules[0]),
				expectedProviderPeriod: "monthly",
				sortOrder: "100",
				isPublished: false,
			};
}

function offerInput(offer: SponsorOffer): SponsorOfferInput {
	return {
		title: offer.title,
		description: offer.description,
		commerceRuleId: offer.commerceRuleId,
		checkoutUrl: offer.commerceType === "donation" ? offer.checkoutUrl : null,
		expectedAmountMinor: offer.commerceType === "donation" ? offer.expectedAmountMinor : null,
		expectedPaymentMode: offer.commerceType === "donation" ? offer.expectedPaymentMode : null,
		expectedProviderPeriod: offer.commerceType === "donation" ? offer.expectedProviderPeriod : null,
		isPublished: offer.isPublished,
		sortOrder: offer.sortOrder,
	};
}

function canPublish(rule: CommerceRule | undefined, donationConfigured = true): boolean {
	return Boolean(rule?.isEnabled && (rule.commerceType !== "donation" || donationConfigured));
}

function hasPublishedSubscription(
	offers: SponsorOffer[],
	externalItemId: string | null,
	exceptOfferId?: string,
): boolean {
	return Boolean(
		externalItemId &&
			offers.some(
				(offer) =>
					offer.id !== exceptOfferId &&
					offer.isPublished &&
					offer.commerceType === "subscription" &&
					offer.externalItemId === externalItemId,
			),
	);
}

function donationOfferConfigured(offer: SponsorOffer): boolean {
	return Boolean(
		offer.checkoutUrl &&
			offer.expectedAmountMinor &&
			offer.expectedPaymentMode &&
			(offer.expectedPaymentMode === "one_time" || offer.expectedProviderPeriod),
	);
}

export function SponsorOffersConfig() {
	const { t, i18n } = useTranslation();
	const offers = useSponsorOffers();
	const rules = useCommerceRules();
	const catalog = useCommerceCatalog();
	const save = useSaveSponsorOffer();
	const [editor, setEditor] = useState<EditorState | null>(null);
	const rulesById = new Map((rules.data ?? []).map((rule) => [rule.id, rule]));
	const allOffers = offers.data ?? [];
	const subscriptionGroups = new Map<string, SponsorOffer[]>();
	for (const offer of allOffers) {
		if (offer.commerceType !== "subscription" || !offer.externalItemId) continue;
		const group = subscriptionGroups.get(offer.externalItemId) ?? [];
		group.push(offer);
		subscriptionGroups.set(offer.externalItemId, group);
	}
	const legacyDuplicateCount = [...subscriptionGroups.values()].reduce(
		(count, group) => count + Math.max(group.length - 1, 0),
		0,
	);

	return (
		<>
			<SettingsSection
				title={t("settings.tribute.offers.section")}
				action={
					<ActionBtn
						variant="action"
						size="sm"
						disabled={rules.isPending || rules.isError || rules.data?.length === 0}
						onClick={(event) => setEditor({ offer: null, returnFocusTo: event.currentTarget })}
					>
						<Plus size={13} aria-hidden="true" /> {t("settings.tribute.offers.add")}
					</ActionBtn>
				}
			>
				<div className={styles.intro}>
					<strong>{t("settings.tribute.offers.introTitle")}</strong>
					<span>{t("settings.tribute.offers.introHint")}</span>
				</div>

				{legacyDuplicateCount > 0 && (
					<div className={offerStyles.duplicateNotice}>
						<InlineFeedback tone="warning">
							{t("settings.tribute.offers.legacyDuplicates")}
						</InlineFeedback>
					</div>
				)}

				{(offers.isPending || rules.isPending) && (
					<>
						<SettingsDivider />
						<p className={styles.state}>{t("settings.tribute.offers.loading")}</p>
					</>
				)}

				{(offers.isError || rules.isError) && (
					<>
						<SettingsDivider />
						<div className={styles.errorState}>
							<InlineFeedback>{t("settings.tribute.offers.loadError")}</InlineFeedback>
							<ActionBtn
								variant="action"
								size="sm"
								onClick={() => void Promise.all([offers.refetch(), rules.refetch()])}
							>
								{t("common.retry")}
							</ActionBtn>
						</div>
					</>
				)}

				{offers.isSuccess && rules.isSuccess && offers.data.length === 0 && (
					<>
						<SettingsDivider />
						<div className={styles.empty}>
							<strong>{t("settings.tribute.offers.emptyTitle")}</strong>
							<span>
								{rules.data.length === 0
									? t("settings.tribute.offers.emptyRulesHint")
									: t("settings.tribute.offers.emptyHint")}
							</span>
							{rules.data.length > 0 && (
								<ActionBtn
									variant="confirm"
									size="md"
									onClick={(event) =>
										setEditor({ offer: null, returnFocusTo: event.currentTarget })
									}
								>
									{t("settings.tribute.offers.createFirst")}
								</ActionBtn>
							)}
						</div>
					</>
				)}

				{allOffers.length > 0 && (
					<div className={offerStyles.offerList}>
						{allOffers.map((offer) => {
							const rule = rulesById.get(offer.commerceRuleId);
							const subscriptionGroup = offer.externalItemId
								? subscriptionGroups.get(offer.externalItemId)
								: undefined;
							const groupLead =
								subscriptionGroup?.find((candidate) => candidate.isPublished) ??
								subscriptionGroup?.[0];
							const siblingCount = Math.max((subscriptionGroup?.length ?? 1) - 1, 0);
							const compactDuplicate = siblingCount > 0 && groupLead?.id !== offer.id;
							const catalogSubscription = catalog.data?.subscriptions.find(
								(subscription) => subscription.externalItemId === rule?.externalItemId,
							);
							const periodOptions: SponsorOfferPriceOption[] =
								offer.priceOptions.length > 0
									? offer.priceOptions
									: (catalogSubscription?.periods.map((period) => ({
											priceMajor: period.priceMajor,
											currency: catalogSubscription.currency,
											period: period.period,
										})) ?? []);
							const duplicateSubscription =
								offer.commerceType === "subscription" &&
								hasPublishedSubscription(allOffers, offer.externalItemId, offer.id);
							const mayPublish =
								!duplicateSubscription &&
								canPublish(
									rule,
									donationOfferConfigured(offer) &&
										Boolean(
											rule &&
												(rule.paymentMode === "any" ||
													rule.paymentMode === offer.expectedPaymentMode),
										),
								);
							if (compactDuplicate) {
								return (
									<details className={offerStyles.legacyOffer} key={offer.id}>
										<summary>
											<span>{offer.title}</span>
											<span className={offerStyles.legacyMeta}>
												<span data-availability={offer.availability}>
													{t(AVAILABILITY_KEYS[offer.availability])}
												</span>
												<ChevronDown size={15} aria-hidden="true" />
											</span>
										</summary>
										<div className={offerStyles.legacyBody}>
											{offer.description && (
												<FormattedText className={offerStyles.legacyDescription}>
													{offer.description}
												</FormattedText>
											)}
											<p className={offerStyles.duplicateHint}>
												{t("settings.tribute.offers.duplicateExtraHint")}
											</p>
											<div className={offerStyles.legacyActions}>
												<div className={offerStyles.visibility}>
													<span>{t("settings.tribute.offers.visibilityLabel")}</span>
													<Toggle
														checked={offer.isPublished}
														disabled={save.isPending || (!offer.isPublished && !mayPublish)}
														ariaLabel={t("settings.tribute.offers.toggleLabel", {
															name: offer.title,
														})}
														onChange={(isPublished) =>
															save.mutate({
																id: offer.id,
																input: { ...offerInput(offer), isPublished },
															})
														}
													/>
												</div>
												<ActionBtn
													variant="action"
													size="sm"
													onClick={(event) =>
														setEditor({ offer, returnFocusTo: event.currentTarget })
													}
												>
													<Pencil size={13} aria-hidden="true" />
													{t("settings.tribute.offers.editAction")}
												</ActionBtn>
											</div>
											<span className={offerStyles.legacyRule}>
												{t("settings.tribute.offers.linkedRule", {
													name: rule?.name ?? t("settings.tribute.offers.ruleUnavailable"),
												})}
											</span>
										</div>
									</details>
								);
							}
							return (
								<article
									className={offerStyles.offerCard}
									key={offer.id}
									data-published={offer.isPublished ? "true" : "false"}
									aria-label={offer.title}
								>
									<div className={offerStyles.cardHeader}>
										<div className={offerStyles.cardTitle}>
											<div>
												<strong>{offer.title}</strong>
												<span data-availability={offer.availability}>
													{t(AVAILABILITY_KEYS[offer.availability])}
												</span>
											</div>
											{offer.description && (
												<FormattedText className={offerStyles.offerDescription}>
													{offer.description}
												</FormattedText>
											)}
										</div>
										<div className={offerStyles.visibility}>
											<span>{t("settings.tribute.offers.visibilityLabel")}</span>
											<Toggle
												checked={offer.isPublished}
												disabled={save.isPending || (!offer.isPublished && !mayPublish)}
												ariaLabel={t("settings.tribute.offers.toggleLabel", {
													name: offer.title,
												})}
												onChange={(isPublished) =>
													save.mutate({
														id: offer.id,
														input: { ...offerInput(offer), isPublished },
													})
												}
											/>
										</div>
									</div>

									{offer.commerceType === "subscription" ? (
										!compactDuplicate &&
										periodOptions.length > 0 && (
											<>
												<SubscriptionBillingList options={periodOptions} tone="plain" />
												<p className={offerStyles.periodHint}>
													{t("settings.tribute.offers.cardPeriodHint")}
												</p>
											</>
										)
									) : periodOptions[0] ? (
										<div className={offerStyles.donationFact}>
											<strong>
												{formatPlanMoney(
													periodOptions[0].priceMajor,
													periodOptions[0].currency,
													i18n.language,
												)}
											</strong>
											<span>{t("settings.tribute.offers.donationPaymentFact")}</span>
										</div>
									) : null}

									<div className={offerStyles.cardFooter}>
										<span>
											{t("settings.tribute.offers.linkedRule", {
												name: rule?.name ?? t("settings.tribute.offers.ruleUnavailable"),
											})}
										</span>
										<ActionBtn
											variant="action"
											size="sm"
											onClick={(event) => setEditor({ offer, returnFocusTo: event.currentTarget })}
										>
											<Pencil size={13} aria-hidden="true" />
											{t("settings.tribute.offers.editAction")}
										</ActionBtn>
									</div>
								</article>
							);
						})}
					</div>
				)}
			</SettingsSection>

			{save.isError && (
				<InlineFeedback>
					{getLocalizedError(save.error, "settings.tribute.offers.toggleError")}
				</InlineFeedback>
			)}

			{editor && rules.data && (
				<SponsorOfferEditor
					offer={editor.offer}
					rules={rules.data}
					offers={offers.data ?? []}
					returnFocusTo={editor.returnFocusTo}
					onClose={() => setEditor(null)}
				/>
			)}
		</>
	);
}

interface SponsorOfferEditorProps {
	offer: SponsorOffer | null;
	rules: CommerceRule[];
	offers: SponsorOffer[];
	returnFocusTo: HTMLElement | null;
	onClose: () => void;
}

function SponsorOfferEditor({
	offer,
	rules,
	offers,
	returnFocusTo,
	onClose,
}: SponsorOfferEditorProps) {
	const { t } = useTranslation();
	const [draft, setDraft] = useState(() => initialDraft(offer, rules));
	const [confirmDelete, setConfirmDelete] = useState(false);
	const deleteTriggerRef = useRef<HTMLButtonElement>(null);
	const save = useSaveSponsorOffer();
	const remove = useDeleteSponsorOffer();
	const catalog = useCommerceCatalog();
	const selectedRule = rules.find((rule) => rule.id === draft.commerceRuleId);
	const selectedSubscription = catalog.data?.subscriptions.find(
		(subscription) => subscription.externalItemId === selectedRule?.externalItemId,
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
			hasPublishedSubscription(offers, selectedRule.externalItemId, offer?.id),
	);
	const valid =
		draft.title.trim().length >= 1 &&
		draft.title.trim().length <= 100 &&
		draft.description.trim().length <= 2_000 &&
		Boolean(selectedRule) &&
		Number.isSafeInteger(sortOrder) &&
		sortOrder >= 1 &&
		sortOrder <= 10_000 &&
		donationDestinationValid &&
		(!draft.isPublished ||
			(!duplicateSubscription && canPublish(selectedRule, donationDestinationComplete)));
	const busy = save.isPending || remove.isPending;

	const submit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!valid) return;
		const input: SponsorOfferInput = {
			title: draft.title.trim(),
			description: draft.description.trim(),
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
				}}
				footer={
					<ActionBtn
						type="submit"
						variant="confirm"
						size="md"
						loading={save.isPending}
						disabled={!valid}
					>
						{offer
							? t("settings.tribute.offers.saveAction")
							: t("settings.tribute.offers.createAction")}
					</ActionBtn>
				}
			>
				<section className={editorStyles.card} aria-labelledby="sponsor-offer-copy-title">
					<h3 id="sponsor-offer-copy-title" className={editorStyles.cardTitle}>
						{t("settings.tribute.offers.presentationSection")}
					</h3>
					<div className={editorStyles.fields}>
						<FormField
							label={t("settings.tribute.offers.titleLabel")}
							htmlFor="sponsor-offer-title"
						>
							<FormFieldInput
								id="sponsor-offer-title"
								value={draft.title}
								maxLength={100}
								placeholder={t("settings.tribute.offers.titlePlaceholder")}
								onChange={(event) => setDraft({ ...draft, title: event.target.value })}
							/>
						</FormField>
						<FormField
							label={t("settings.tribute.offers.descriptionLabel")}
							htmlFor="sponsor-offer-description"
							hint={t("settings.tribute.offers.descriptionHint")}
						>
							<Suspense
								fallback={
									<output className={offerStyles.editorLoading}>
										{t("common.formattedText.loading")}
									</output>
								}
							>
								<FormattedTextEditor
									id="sponsor-offer-description"
									ariaLabel={t("settings.tribute.offers.descriptionLabel")}
									value={draft.description}
									maxLength={300}
									placeholder={t("settings.tribute.offers.descriptionPlaceholder")}
									onChange={(description) => setDraft({ ...draft, description })}
								/>
							</Suspense>
						</FormField>
					</div>
				</section>

				<section className={editorStyles.card} aria-labelledby="sponsor-offer-delivery-title">
					<h3 id="sponsor-offer-delivery-title" className={editorStyles.cardTitle}>
						{t("settings.tribute.offers.deliverySection")}
					</h3>
					<div className={editorStyles.fields}>
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
								min="1"
								max="10000"
								value={draft.sortOrder}
								onChange={(event) => setDraft({ ...draft, sortOrder: event.target.value })}
							/>
						</FormField>
						<div className={editorStyles.providerExpiry}>
							<strong>{t("settings.tribute.offers.publishTitle")}</strong>
							<span>
								{!duplicateSubscription && canPublish(selectedRule, donationDestinationComplete)
									? t("settings.tribute.offers.publishHint")
									: t(
											duplicateSubscription
												? "settings.tribute.offers.publishDuplicateSubscription"
												: "settings.tribute.offers.publishUnavailable",
										)}
							</span>
							<Toggle
								checked={draft.isPublished}
								disabled={
									!draft.isPublished &&
									(duplicateSubscription || !canPublish(selectedRule, donationDestinationComplete))
								}
								ariaLabel={t("settings.tribute.offers.publishLabel")}
								onChange={(isPublished) => setDraft({ ...draft, isPublished })}
							/>
						</div>
					</div>
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
							onClick={() => setConfirmDelete(true)}
						>
							{t("settings.tribute.offers.deleteAction")}
						</ActionBtn>
					</section>
				)}

				{save.isError && (
					<InlineFeedback>
						{getLocalizedError(save.error, "settings.tribute.offers.saveError")}
					</InlineFeedback>
				)}
				{remove.isError && (
					<InlineFeedback>
						{getLocalizedError(remove.error, "settings.tribute.offers.deleteError")}
					</InlineFeedback>
				)}
			</EditorDialog>

			<ConfirmDialog
				open={confirmDelete}
				title={t("settings.tribute.offers.deleteConfirmTitle")}
				confirmLabel={t("settings.tribute.offers.deleteAction")}
				cancelLabel={t("access.cancel")}
				confirmVariant="danger"
				confirmLoading={remove.isPending}
				returnFocusRef={deleteTriggerRef}
				onCancel={() => setConfirmDelete(false)}
				onConfirm={() => {
					if (!offer) return;
					remove.mutate(offer.id, { onSuccess: onClose });
				}}
			>
				{t("settings.tribute.offers.deleteConfirmBody", { name: offer?.title })}
			</ConfirmDialog>
		</>
	);
}
