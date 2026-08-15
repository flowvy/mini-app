import type { TributeSubscriptionPeriod } from "../types/commerce.ts";

export const TRIBUTE_PERIOD_KEYS: Record<TributeSubscriptionPeriod, string> = {
	trial: "settings.tribute.rules.period.trial",
	onetime: "settings.tribute.rules.period.onetime",
	weekly: "settings.tribute.rules.period.weekly",
	monthly: "settings.tribute.rules.period.monthly",
	quarterly: "settings.tribute.rules.period.quarterly",
	halfyearly: "settings.tribute.rules.period.halfyearly",
	yearly: "settings.tribute.rules.period.yearly",
};

export const TRIBUTE_BILLING_INTERVAL_KEYS: Record<TributeSubscriptionPeriod, string> = {
	trial: "common.tributeBillingInterval.trial",
	onetime: "common.tributeBillingInterval.onetime",
	weekly: "common.tributeBillingInterval.weekly",
	monthly: "common.tributeBillingInterval.monthly",
	quarterly: "common.tributeBillingInterval.quarterly",
	halfyearly: "common.tributeBillingInterval.halfyearly",
	yearly: "common.tributeBillingInterval.yearly",
};
