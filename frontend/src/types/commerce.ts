export type CommerceProvider = "tribute";
export type CommerceType = "donation" | "subscription" | "digital_product";
export type PaymentMode = "any" | "one_time" | "recurring";
export type CalculationType = "fixed" | "volume";
export type GrantMode = "extend" | "replace";

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

export function commerceRuleInput(rule: CommerceRule): CommerceRuleInput {
	const { id: _id, ...input } = rule;
	return input;
}
