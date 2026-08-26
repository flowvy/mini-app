import { ChevronDown, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
	useCommerceCatalog,
	useCommerceRules,
	useSaveSponsorOffer,
	useSponsorOffers,
} from "../../hooks/use-commerce-rules.ts";
import { getLocalizedError } from "../../lib/error-copy.ts";
import { paymentDestinationIssue } from "../../lib/payment-destination.ts";
import type {
	SponsorOffer,
	SponsorOfferAvailability,
	SponsorOfferInput,
	SponsorOfferPriceOption,
} from "../../types/commerce.ts";
import { SponsorOfferCard } from "../commerce/sponsor-offer-card.tsx";
import { FormattedText } from "../content/formatted-text.tsx";
import { ActionBtn } from "../ui/action-btn.tsx";
import { InlineFeedback } from "../ui/inline-feedback.tsx";
import { SectionSkeleton } from "../ui/page-skeleton.tsx";
import { Toggle } from "../ui/toggle.tsx";
import styles from "./commerce-rules-config.module.css";
import { SettingsDivider, SettingsSection } from "./settings-surface.tsx";
import { SponsorOfferEditor } from "./sponsor-offer-editor.tsx";
import { canPublishSponsorOffer, hasPublishedSubscriptionOffer } from "./sponsor-offer-logic.ts";
import offerStyles from "./sponsor-offers-config.module.css";

interface EditorState {
	offer: SponsorOffer | null;
	returnFocusTo: HTMLElement | null;
}

const AVAILABILITY_KEYS: Record<SponsorOfferAvailability, string> = {
	draft: "settings.tribute.offers.availability.draft",
	ready: "settings.tribute.offers.availability.ready",
	rule_disabled: "settings.tribute.offers.availability.ruleDisabled",
	profile_unavailable: "settings.tribute.offers.availability.profileUnavailable",
	configuration_changed: "settings.tribute.offers.availability.configurationChanged",
};

function offerInput(offer: SponsorOffer): SponsorOfferInput {
	return {
		title: offer.title,
		description: offer.description,
		contentLocales: offer.contentLocales ?? {},
		excludedRemnawaveTags: offer.excludedRemnawaveTags ?? [],
		commerceRuleId: offer.commerceRuleId,
		checkoutUrl: offer.commerceType === "donation" ? offer.checkoutUrl : null,
		expectedAmountMinor: offer.commerceType === "donation" ? offer.expectedAmountMinor : null,
		expectedPaymentMode: offer.commerceType === "donation" ? offer.expectedPaymentMode : null,
		expectedProviderPeriod: offer.commerceType === "donation" ? offer.expectedProviderPeriod : null,
		isPublished: offer.isPublished,
		sortOrder: offer.sortOrder,
	};
}

function donationOfferConfigured(offer: SponsorOffer): boolean {
	return Boolean(
		offer.checkoutUrl &&
			offer.expectedAmountMinor &&
			offer.expectedPaymentMode &&
			(offer.expectedPaymentMode === "one_time" || offer.expectedProviderPeriod),
	);
}

function OfferVisibilityToggle({
	offer,
	mayPublish,
	pending,
	onChange,
}: {
	offer: SponsorOffer;
	mayPublish: boolean;
	pending: boolean;
	onChange: (isPublished: boolean) => void;
}) {
	const { t } = useTranslation();
	return (
		<div className={offerStyles.visibility}>
			<span>{t("settings.tribute.offers.visibilityLabel")}</span>
			<Toggle
				checked={offer.isPublished}
				disabled={pending || (!offer.isPublished && !mayPublish)}
				ariaLabel={t("settings.tribute.offers.toggleLabel", { name: offer.title })}
				onChange={onChange}
			/>
		</div>
	);
}

interface SponsorOffersConfigProps {
	subscriptionUrls: Record<string, string>;
	contentDefaultLocale: string;
	templateVariables: string[];
}

export function SponsorOffersConfig({
	subscriptionUrls,
	contentDefaultLocale,
	templateVariables,
}: SponsorOffersConfigProps) {
	const { t } = useTranslation();
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
					<div className={offerStyles.duplicateNotice} data-ui="duplicate-notice">
						<InlineFeedback tone="warning">
							{t("settings.tribute.offers.legacyDuplicates")}
						</InlineFeedback>
					</div>
				)}

				{(offers.isPending || rules.isPending) && (
					<>
						<SettingsDivider />
						<SectionSkeleton rows={3} />
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
					<div className={offerStyles.offerList} data-ui="sponsor-offer-list">
						{allOffers.map((offer) => {
							const rule = rulesById.get(offer.commerceRuleId);
							const subscriptionDestination = rule?.externalItemId
								? subscriptionUrls[rule.externalItemId]
								: undefined;
							const subscriptionDestinationConfigured = Boolean(
								subscriptionDestination?.trim() &&
									paymentDestinationIssue(subscriptionDestination) === null,
							);
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
								hasPublishedSubscriptionOffer(allOffers, offer.externalItemId, offer.id);
							const mayPublish =
								!duplicateSubscription &&
								canPublishSponsorOffer(
									rule,
									donationOfferConfigured(offer) &&
										Boolean(
											rule &&
												(rule.paymentMode === "any" ||
													rule.paymentMode === offer.expectedPaymentMode),
										),
									subscriptionDestinationConfigured,
								);
							if (compactDuplicate) {
								return (
									<details
										className={offerStyles.legacyOffer}
										data-ui="legacy-sponsor-offer"
										key={offer.id}
									>
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
											<p className={offerStyles.duplicateHint} data-ui="duplicate-sponsor-warning">
												{t("settings.tribute.offers.duplicateExtraHint")}
											</p>
											<div className={offerStyles.legacyActions}>
												<OfferVisibilityToggle
													offer={offer}
													mayPublish={mayPublish}
													pending={save.isPending}
													onChange={(isPublished) =>
														save.mutate({
															id: offer.id,
															input: { ...offerInput(offer), isPublished },
														})
													}
												/>
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
								<div
									className={offerStyles.offerManagement}
									key={offer.id}
									data-published={offer.isPublished ? "true" : "false"}
								>
									<div className={offerStyles.cardHeader}>
										<span
											className={offerStyles.availability}
											data-availability={offer.availability}
										>
											{t(AVAILABILITY_KEYS[offer.availability])}
										</span>
										<OfferVisibilityToggle
											offer={offer}
											mayPublish={mayPublish}
											pending={save.isPending}
											onChange={(isPublished) =>
												save.mutate({
													id: offer.id,
													input: { ...offerInput(offer), isPublished },
												})
											}
										/>
									</div>

									<SponsorOfferCard offer={{ ...offer, priceOptions: periodOptions }} preview />

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
								</div>
							);
						})}
					</div>
				)}
			</SettingsSection>

			{save.isError && (
				<InlineFeedback attention="action">
					{getLocalizedError(save.error, "settings.tribute.offers.toggleError")}
				</InlineFeedback>
			)}

			{editor && rules.data && (
				<SponsorOfferEditor
					offer={editor.offer}
					rules={rules.data}
					offers={offers.data ?? []}
					subscriptionUrls={subscriptionUrls}
					contentDefaultLocale={contentDefaultLocale}
					templateVariables={templateVariables}
					returnFocusTo={editor.returnFocusTo}
					onClose={() => setEditor(null)}
				/>
			)}
		</>
	);
}
