export type CommerceProvider = "tribute";
export type CommerceType = "donation" | "subscription";
export type PaymentMode = "any" | "one_time" | "recurring";
export type SponsorDonationPaymentMode = Exclude<PaymentMode, "any">;
export type CalculationType = "fixed" | "volume" | "provider_expiry";
export type GrantMode = "extend" | "replace";
export type TributeSubscriptionPeriod =
	| "trial"
	| "onetime"
	| "weekly"
	| "monthly"
	| "quarterly"
	| "halfyearly"
	| "yearly";
export type TributeDonationPeriod = Exclude<TributeSubscriptionPeriod, "trial" | "onetime">;
export type EntitlementOperationKind = "grant" | "refund" | "restore" | "review";
export type EntitlementOperatorAction = "retry" | "resolve";
export type EntitlementOperationStatus =
	| "pending"
	| "processing"
	| "retry"
	| "applied"
	| "review"
	| "resolved"
	| "cancelled";

export interface AmountBand {
	fromAmountMinor: number;
	unitAmountMinor: number;
	unitDays: number;
}

export interface CommerceRuleInput {
	provider: CommerceProvider;
	name: string;
	commerceType: CommerceType;
	paymentMode: PaymentMode;
	externalItemId: string | null;
	currency: string;
	calculationType: CalculationType;
	fixedDurationDays: number | null;
	amountBands: AmountBand[];
	accessProfileId: string;
	grantMode: GrantMode;
	priority: number;
	isEnabled: boolean;
}

export interface CommerceRule extends CommerceRuleInput {
	id: string;
}

export interface CommerceRulePreview {
	matched: boolean;
	durationDays: number | null;
	matchedBand: AmountBand | null;
}

export interface CommerceCatalogSubscriptionPeriod {
	periodId: string;
	period: TributeSubscriptionPeriod;
	priceMajor: string;
}

export interface CommerceCatalogSubscription {
	externalItemId: string;
	name: string;
	currency: string;
	periods: CommerceCatalogSubscriptionPeriod[];
}

export interface CommerceCatalog {
	subscriptions: CommerceCatalogSubscription[];
}

export interface EntitlementOperation {
	id: string;
	eventName: string;
	operationKind: EntitlementOperationKind;
	status: EntitlementOperationStatus;
	reasonCode: string | null;
	providerCreatedAt: string;
	telegramUserId: number | null;
	externalItemId: string | null;
	amountMinor: number | null;
	currency: string | null;
	durationDays: number | null;
	targetExpiry: string | null;
	attemptCount: number;
	createdAt: string;
	availableActions: EntitlementOperatorAction[];
	lastAction: {
		action: EntitlementOperatorAction;
		note: string | null;
		createdAt: string;
	} | null;
}

export interface EntitlementOperationList {
	operations: EntitlementOperation[];
	hasMore: boolean;
}

export interface EntitlementOperatorActionInput {
	requestId: string;
	action: EntitlementOperatorAction;
	note: string | null;
}

export type SponsorOfferAvailability =
	| "draft"
	| "ready"
	| "rule_disabled"
	| "profile_unavailable"
	| "configuration_changed";

export interface SponsorOfferPriceOption {
	priceMajor: string;
	currency: string;
	period: TributeSubscriptionPeriod | null;
}

export interface SponsorOfferLocale {
	title: string;
	description: string;
}

export interface SponsorOfferInput {
	title: string;
	description: string;
	contentLocales: Record<string, SponsorOfferLocale>;
	commerceRuleId: string;
	checkoutUrl: string | null;
	expectedAmountMinor: number | null;
	expectedPaymentMode: SponsorDonationPaymentMode | null;
	expectedProviderPeriod: TributeDonationPeriod | null;
	isPublished: boolean;
	sortOrder: number;
}

export interface SponsorOffer extends SponsorOfferInput {
	id: string;
	provider: CommerceProvider;
	commerceType: CommerceType;
	paymentMode: PaymentMode;
	externalItemId: string | null;
	checkoutUrl: string | null;
	priceOptions: SponsorOfferPriceOption[];
	requiresNonAnonymous: boolean;
	availability: SponsorOfferAvailability;
}

export type SponsorStateStatus =
	| "no_access"
	| "base_access"
	| "checkout_pending"
	| "provisioning"
	| "attention"
	| "one_time_active"
	| "one_time_expired"
	| "recurring_trial"
	| "recurring_active"
	| "recurring_donation_active"
	| "recurring_cancelled_active"
	| "recurring_expired"
	| "refunded";

export type SponsorPrimaryAction =
	| "choose_offer"
	| "continue_checkout"
	| "refresh"
	| "renew"
	| "manage_subscription"
	| "manage_auto_donation"
	| "resume_recurring"
	| "none";

export interface SponsorCheckout {
	id: string;
	offerId: string | null;
	status: "pending" | "confirmed" | "expired";
	checkoutUrl: string;
	expiresAt: string;
}

export interface SponsorState {
	status: SponsorStateStatus;
	accessLevel: "none" | "base" | "paid";
	primaryAction: SponsorPrimaryAction;
	paidExpiresAt: string | null;
	baseExpiresAt: string | null;
	currentOfferId: string | null;
	managementUrl: string | null;
	pendingCheckout: SponsorCheckout | null;
	offers: SponsorOffer[];
}

export function commerceRuleInput(rule: CommerceRule): CommerceRuleInput {
	const { id: _id, ...input } = rule;
	return input;
}
