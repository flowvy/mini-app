export type CommerceProvider = "tribute";
export type CommerceType = "donation" | "subscription" | "digital_product";
export type PaymentMode = "any" | "one_time" | "recurring";
export type CalculationType = "fixed" | "volume";
export type GrantMode = "extend" | "replace";
export type EntitlementOperationKind = "grant" | "refund" | "review";
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

export function commerceRuleInput(rule: CommerceRule): CommerceRuleInput {
	const { id: _id, ...input } = rule;
	return input;
}
