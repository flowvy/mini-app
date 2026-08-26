import type { Locator } from "@playwright/test";
import { expect } from "./mock-api.ts";

export async function submitEditor(dialog: Locator): Promise<void> {
	const language = dialog.getByRole("group", { name: "Content language" });
	if ((await language.count()) > 0) {
		await language.getByRole("radio", { name: "Russian" }).click();
		const localizedTitle = dialog.getByLabel("Offer title");
		if ((await localizedTitle.inputValue()) === "") {
			await localizedTitle.fill("Расширенный доступ");
		}
		await language.getByRole("radio", { name: "English" }).click();
	}
	await dialog.locator("form").evaluate((form) => (form as HTMLFormElement).requestSubmit());
}

export async function expectActionErrorRevealed(error: Locator): Promise<void> {
	await expect(error).toBeVisible();
	await expect(error).toBeFocused();
	await expect
		.poll(() =>
			error.evaluate((element) => {
				const rect = element.getBoundingClientRect();
				return rect.top >= 0 && rect.bottom <= window.innerHeight;
			}),
		)
		.toBe(true);
}

export async function selectElementContents(locator: Locator) {
	await locator.evaluate((element) => {
		const selection = window.getSelection();
		if (!selection) throw new Error("Selection API is unavailable");
		const range = document.createRange();
		range.selectNodeContents(element);
		selection.removeAllRanges();
		selection.addRange(range);
		document.dispatchEvent(new Event("selectionchange"));
	});
}

export async function placeCaretAtEnd(locator: Locator) {
	await locator.evaluate((element) => {
		const selection = window.getSelection();
		if (!selection) throw new Error("Selection API is unavailable");
		const range = document.createRange();
		range.selectNodeContents(element);
		range.collapse(false);
		selection.removeAllRanges();
		selection.addRange(range);
		(element as HTMLElement).focus();
		document.dispatchEvent(new Event("selectionchange"));
	});
}

export function sponsorSubscriptionOffer(
	checkoutUrl = "https://t.me/tribute/app?startapp=subscription_12",
) {
	return {
		id: "30000000-0000-4000-8000-000000000001",
		title: "Monthly sponsor access",
		description: "Recurring support with extended access.",
		commerceRuleId: "10000000-0000-4000-8000-000000000012",
		isPublished: true,
		sortOrder: 10,
		provider: "tribute",
		commerceType: "subscription",
		paymentMode: "recurring",
		externalItemId: "12",
		checkoutUrl,
		expectedAmountMinor: null,
		expectedPaymentMode: null,
		expectedProviderPeriod: null,
		priceOptions: [{ priceMajor: "500", currency: "RUB", period: "monthly" }],
		requiresNonAnonymous: false,
		benefits: { trafficLimitBytes: 100 * 1024 ** 3, deviceLimit: 5 },
		availability: "ready",
		welcomeDiscount: false,
		welcomeDiscountPercent: null,
	};
}

export function sponsorYearlySubscriptionOffer() {
	return {
		...sponsorSubscriptionOffer("https://t.me/tribute/app?startapp=subscription_13"),
		id: "30000000-0000-4000-8000-000000000004",
		title: "Yearly sponsor access",
		description: "Recurring yearly support with extended access.",
		commerceRuleId: "10000000-0000-4000-8000-000000000014",
		externalItemId: "13",
		priceOptions: [{ priceMajor: "3500", currency: "RUB", period: "yearly" as const }],
	};
}

export function sponsorMultiPeriodOffer() {
	return {
		...sponsorSubscriptionOffer(),
		title: "Sponsor access",
		priceOptions: [
			{ priceMajor: "100", currency: "RUB", period: "monthly" as const },
			{ priceMajor: "270", currency: "RUB", period: "quarterly" as const },
			{ priceMajor: "900", currency: "RUB", period: "yearly" as const },
		],
	};
}

export function sponsorDonationOffer(
	checkoutUrl = "https://t.me/tribute/app?startapp=donation_month",
	title = "One month sponsor",
	expectedPaymentMode: "one_time" | "recurring" = "one_time",
	expectedProviderPeriod:
		| "weekly"
		| "monthly"
		| "quarterly"
		| "halfyearly"
		| "yearly"
		| null = null,
) {
	return {
		...sponsorSubscriptionOffer(checkoutUrl),
		id: "30000000-0000-4000-8000-000000000002",
		title,
		description: "Keep the service available for everyone.",
		commerceType: "donation",
		paymentMode: "any",
		externalItemId: null,
		expectedAmountMinor: 50_000,
		expectedPaymentMode,
		expectedProviderPeriod,
		priceOptions: [{ priceMajor: "500", currency: "RUB", period: expectedProviderPeriod }],
		requiresNonAnonymous: true,
	};
}

export function sponsorDonationRule() {
	return {
		id: "10000000-0000-4000-8000-000000000013",
		provider: "tribute",
		name: "Flexible sponsor donations",
		commerceType: "donation",
		paymentMode: "any",
		externalItemId: null,
		currency: "RUB",
		calculationType: "volume",
		fixedDurationDays: null,
		amountBands: [
			{ fromAmountMinor: 50_000, unitAmountMinor: 50_000, unitDays: 30 },
			{ fromAmountMinor: 350_000, unitAmountMinor: 350_000, unitDays: 365 },
		],
		accessProfileId: "00000000-0000-4000-8000-000000000001",
		grantMode: "extend",
		priority: 100,
		isEnabled: true,
	};
}

export function sponsorSubscriptionRule() {
	return {
		id: "10000000-0000-4000-8000-000000000012",
		provider: "tribute",
		name: "Tribute monthly supporter",
		commerceType: "subscription",
		paymentMode: "recurring",
		externalItemId: "12",
		currency: "RUB",
		calculationType: "provider_expiry",
		fixedDurationDays: null,
		amountBands: [],
		accessProfileId: "00000000-0000-4000-8000-000000000001",
		grantMode: "replace",
		priority: 100,
		isEnabled: true,
	};
}
