import AxeBuilder from "@axe-core/playwright";
import type { Locator } from "@playwright/test";
import {
	assertNoHorizontalOverflow,
	entitlementOperation,
	expect,
	mockData,
	test,
} from "./fixtures/mock-api.ts";
import {
	installTelegramMainButton,
	latestTelegramMainButton,
	pressTelegramMainButton,
	withTelegramMainButton,
} from "./fixtures/telegram-main-button.ts";

async function submitEditor(dialog: Locator): Promise<void> {
	const language = dialog.getByRole("radiogroup", { name: "Content language" });
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

async function expectActionErrorRevealed(error: Locator): Promise<void> {
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

async function selectElementContents(locator: Locator) {
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

async function placeCaretAtEnd(locator: Locator) {
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

function sponsorSubscriptionOffer(
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

function sponsorYearlySubscriptionOffer() {
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

function sponsorMultiPeriodOffer() {
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

function sponsorDonationOffer(
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

function sponsorDonationRule() {
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

function sponsorSubscriptionRule() {
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

test("Tribute onboarding is a separate payment-provider route with stable navigation", async ({
	page,
	mockApi: _mock,
}) => {
	await page.goto("/admin/settings");
	const payments = page
		.getByRole("heading", { name: "Payments" })
		.locator("xpath=ancestor::section[1]");
	await payments.getByRole("button", { name: /^Tribute Subscriptions/ }).click();
	await expect(page).toHaveURL(/\/admin\/settings\/tribute$/);
	await expect(page.getByRole("banner").getByText("Tribute", { exact: true })).toBeVisible();
	await expect(page.getByRole("heading", { name: "Setup" })).toBeVisible();
	await expect(page.getByRole("heading", { name: "Management" })).toBeVisible();
	await expect(page.getByRole("heading", { name: "Operations" })).toBeVisible();
	await expect(
		page.getByText("Provider setup is separate from offers and payment operations", {
			exact: true,
		}),
	).toHaveCount(0);

	await page.goBack();
	await expect(page).toHaveURL(/\/admin\/settings$/);
	await page.goForward();
	await expect(page).toHaveURL(/\/admin\/settings\/tribute$/);
	await assertNoHorizontalOverflow(page);
});

test("Tribute API check is read-only and never exposes the server credential", async ({
	page,
	mockApi,
}) => {
	await page.goto("/admin/settings/tribute/connection");
	await expect(page.getByText("Configured on server", { exact: true })).toBeVisible();
	await expect(page.locator('input[type="password"]')).toHaveCount(0);
	await expect(page.getByText(/test_tribute_key/i)).toHaveCount(0);

	const requestPromise = page.waitForRequest(
		(request) =>
			request.method() === "POST" &&
			new URL(request.url()).pathname === "/api/debug/admin/settings/tribute/test",
	);
	await page.getByRole("button", { name: "Check API" }).click();
	const request = await requestPromise;
	expect(request.postData()).toBeNull();
	await expect(page.getByText("Connected", { exact: true })).toBeVisible();
	expect(mockApi.calls).not.toContain("PATCH /api/debug/admin/settings");
	await assertNoHorizontalOverflow(page);
});

test("Tribute setup and provider failures remain explicit without fake payment readiness", async ({
	page,
	mockApi,
}) => {
	mockApi.seedSettings({ tributeCredentialsConfigured: false });
	await page.goto("/admin/settings/tribute/connection");
	await expect(page.getByText("Missing on server", { exact: true })).toBeVisible();
	await expect(page.getByText(/Set TRIBUTE_API_KEY/)).toBeVisible();
	await expect(page.getByRole("button", { name: "Check API" })).toBeDisabled();
	await expect(page.getByRole("heading", { name: "Webhook delivery" })).toHaveCount(0);
	await assertNoHorizontalOverflow(page);

	mockApi.seedSettings({ tributeCredentialsConfigured: true });
	mockApi.mock("POST", "/api/debug/admin/settings/tribute/test", {
		body: { ok: false, error: "private provider diagnostic" },
	});
	await page.reload();
	await page.getByRole("button", { name: "Check API" }).click();
	await expect(page.getByText("Check failed", { exact: true })).toBeVisible();
	await expect(page.getByRole("alert")).toContainText("Tribute API check failed");
	await expect(page.getByText("private provider diagnostic")).toHaveCount(0);
});

test("admin saves per-subscription payment links without creating a payment", async ({
	page,
	mockApi,
}) => {
	const patches: Array<Record<string, unknown>> = [];
	page.on("request", (request) => {
		if (
			request.method() === "PATCH" &&
			new URL(request.url()).pathname === "/api/debug/admin/settings"
		) {
			patches.push(request.postDataJSON() as Record<string, unknown>);
		}
	});

	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto("/admin/settings/tribute/payment-links");
	await expect(page.getByRole("heading", { name: "Payment links" })).toBeVisible();
	await page.getByLabel("Supporter").fill(" https://t.me/tribute/app?startapp=subscription_12 ");
	await page.getByRole("button", { name: "Save payment links", exact: true }).click();

	await expect(page.getByText("Payment links saved", { exact: true })).toBeVisible();
	expect(patches).toEqual([
		{
			tributeSubscriptionUrls: {
				"12": "https://t.me/tribute/app?startapp=subscription_12",
			},
		},
	]);
	expect(mockApi.calls).not.toContain("POST /api/debug/admin/settings/tribute/test");

	await page.reload();
	await expect(page.getByLabel("Supporter")).toHaveValue(
		"https://t.me/tribute/app?startapp=subscription_12",
	);
	await assertNoHorizontalOverflow(page);
});

test("payment links validate locally and protect unsaved changes", async ({
	page,
	mockApi: _mock,
}) => {
	await page.goto("/admin/settings");
	const payments = page
		.getByRole("heading", { name: "Payments" })
		.locator("xpath=ancestor::section[1]");
	await payments.getByRole("button", { name: /^Tribute Subscriptions/ }).click();
	await page.getByRole("button", { name: /^Payment links/ }).click();

	const subscription = page.getByLabel("Supporter");
	await subscription.fill("http://pay.example.test/subscription");
	await expect(page.getByRole("alert")).toContainText("Use an HTTPS link");
	await expect(
		page.getByRole("button", { name: "Save payment links", exact: true }),
	).toBeDisabled();
	await subscription.fill("https://pay.example.test/subscription");
	await expect(page.getByRole("button", { name: "Save payment links", exact: true })).toBeEnabled();

	await page.goBack();
	const dialog = page.getByRole("dialog", { name: "Discard payment link changes?" });
	await expect(dialog).toBeVisible();
	await dialog.getByRole("button", { name: "Keep editing", exact: true }).click();
	await expect(page).toHaveURL(/\/admin\/settings\/tribute\/payment-links$/);
	await expect(subscription).toHaveValue("https://pay.example.test/subscription");

	await page.goBack();
	await dialog.getByRole("button", { name: "Discard", exact: true }).click();
	await expect(page).toHaveURL(/\/admin\/settings\/tribute$/);
});

test("payment link catalog failure retries safely and preserves unavailable mappings", async ({
	page,
	mockApi,
}) => {
	mockApi.seedSettings({
		tributeSubscriptionUrls: {
			"999": "https://pay.example.test/subscription/999",
		},
	});
	mockApi.mock("GET", "/api/debug/admin/commerce/catalog", [
		{ status: 503, body: { detail: "private catalog diagnostic" } },
		{ status: 503, body: { detail: "private catalog diagnostic" } },
		{ body: mockData.commerceCatalog },
	]);

	await page.goto("/admin/settings/tribute/payment-links");
	await expect(page.getByRole("alert")).toContainText("Could not load subscriptions");
	await expect(page.getByText("private catalog diagnostic")).toHaveCount(0);
	await page.getByRole("button", { name: "Retry", exact: true }).click();

	const legacy = page.getByLabel("Unavailable subscription · ID 999");
	await expect(legacy).toHaveValue("https://pay.example.test/subscription/999");
	await expect(page.getByLabel("Supporter")).toBeVisible();
	await legacy.fill("");
	await page.getByRole("button", { name: "Save payment links", exact: true }).click();
	await expect(page.getByText("Payment links saved", { exact: true })).toBeVisible();
	await assertNoHorizontalOverflow(page);
});

test("payment links expose catalog loading and empty states", async ({ page, mockApi }) => {
	mockApi.mock("GET", "/api/debug/admin/commerce/catalog", {
		delayMs: 600,
		body: { subscriptions: [] },
	});
	await page.goto("/admin/settings/tribute/payment-links");

	await expect(
		page.locator('[data-ui="loading-skeleton"]:not([data-skeleton-variant])'),
	).toBeVisible();
	await expect(page.getByText(/Tribute returned no subscriptions/)).toBeVisible();
	await assertNoHorizontalOverflow(page);
});

test("admin independently configures inviter days and a shared welcome discount", async ({
	page,
	mockApi,
}, testInfo) => {
	const offer = sponsorSubscriptionOffer();
	const automationProfile = {
		...mockData.accessProfiles[0],
		id: "00000000-0000-4000-8000-000000000099",
		name: "Referral benefits",
		validityMode: "automation",
		validityDays: null,
	};
	mockApi.seedAccessProfiles([automationProfile]);
	mockApi.seedSponsorOffers([offer]);
	const patches: Array<Record<string, unknown>> = [];
	page.on("request", (request) => {
		if (
			request.method() === "PATCH" &&
			new URL(request.url()).pathname === "/api/debug/admin/settings"
		) {
			patches.push(request.postDataJSON() as Record<string, unknown>);
		}
	});

	await page.goto("/admin/settings/tribute/referral-benefits");
	const section = page
		.getByRole("heading", { name: "Referral benefits" })
		.locator("xpath=ancestor::section[1]");
	await section.getByRole("switch", { name: "Enable welcome discount" }).click();
	await expect(section.getByLabel("Subscription offer")).toBeVisible();
	await expect(section.getByLabel("Reward days", { exact: true })).toHaveCount(0);
	await section.getByLabel("Discount percentage").fill("25");
	await section.getByLabel("Subscription offer").selectOption(offer.id);
	await section
		.getByLabel("Tribute promo link")
		.fill("https://t.me/tribute/app?startapp=welcome_promo");

	await section.getByRole("switch", { name: "Enable inviter reward days" }).click();
	await section.getByLabel("Reward days", { exact: true }).fill("7");
	await section.getByLabel("Reward benefits profile").selectOption(automationProfile.id);
	await page.getByRole("button", { name: "Save referral benefits" }).click();

	await expect.poll(() => patches.length).toBe(1);
	expect(patches[0]).toEqual({
		referralRewardEnabled: true,
		referralRewardDays: 7,
		referralRewardAccessProfileId: automationProfile.id,
		welcomeDiscountEnabled: true,
		welcomeDiscountOfferId: offer.id,
		welcomeDiscountUrl: "https://t.me/tribute/app?startapp=welcome_promo",
		welcomeDiscountPercent: 25,
	});
	for (const colorScheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		await assertNoHorizontalOverflow(page);
		await section.screenshot({
			path: testInfo.outputPath(`referral-benefits-configured-${colorScheme}.png`),
		});
	}
});

test("referral benefits protect unsaved changes with localized copy", async ({
	page,
	mockApi,
}, testInfo) => {
	const automationProfile = {
		...mockData.accessProfiles[0],
		id: "00000000-0000-4000-8000-000000000099",
		name: "Referral benefits",
		validityMode: "automation",
		validityDays: null,
	};
	mockApi.seedAccessProfiles([automationProfile]);

	await page.goto("/admin/settings");
	const payments = page
		.getByRole("heading", { name: "Payments" })
		.locator("xpath=ancestor::section[1]");
	await payments.getByRole("button", { name: /^Tribute Subscriptions/ }).click();
	await page.getByRole("button", { name: /^Referral benefits/ }).click();
	const section = page
		.getByRole("heading", { name: "Referral benefits" })
		.locator("xpath=ancestor::section[1]");
	await section.getByRole("switch", { name: "Enable inviter reward days" }).click();
	await section.getByLabel("Reward days", { exact: true }).fill("7");
	await section.getByLabel("Reward benefits profile").selectOption(automationProfile.id);

	await page.goBack();
	const dialog = page.getByRole("dialog", { name: "Discard referral benefit changes?" });
	await expect(dialog).toBeVisible();
	await expect(dialog).toContainText("The unsaved referral benefit changes will be lost");
	await expect(dialog.getByText(/^settings\./)).toHaveCount(0);
	for (const colorScheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		await dialog.screenshot({
			path: testInfo.outputPath(`referral-discard-${colorScheme}.png`),
		});
	}
	await dialog.getByRole("button", { name: "Keep editing", exact: true }).click();
	await expect(page).toHaveURL(/\/admin\/settings\/tribute\/referral-benefits$/);
	await expect(section.getByLabel("Reward days", { exact: true })).toHaveValue("7");

	await page.goBack();
	await dialog.getByRole("button", { name: "Discard", exact: true }).click();
	await expect(page).toHaveURL(/\/admin\/settings\/tribute$/);
	await assertNoHorizontalOverflow(page);
});

test("referral configuration recovers when its profile and offer data fail to load", async ({
	page,
	mockApi,
}) => {
	mockApi.mock("GET", "/api/debug/admin/registration/access-profiles", [
		{ status: 503, body: { detail: "private profile diagnostic" } },
		{ status: 503, body: { detail: "private profile diagnostic" } },
		{ body: mockData.accessProfiles },
	]);
	mockApi.mock("GET", "/api/debug/admin/commerce/offers", [
		{ status: 503, body: { detail: "private offer diagnostic" } },
		{ status: 503, body: { detail: "private offer diagnostic" } },
		{ body: [] },
	]);

	await page.goto("/admin/settings/tribute/referral-benefits");
	const section = page
		.getByRole("heading", { name: "Referral benefits" })
		.locator("xpath=ancestor::section[1]");
	await expect(section.getByRole("alert")).toContainText(
		"Could not load referral profiles or sponsor offers",
	);
	await expect(page.getByText("private profile diagnostic")).toHaveCount(0);
	await expect(page.getByText("private offer diagnostic")).toHaveCount(0);
	await section.getByRole("button", { name: "Retry", exact: true }).click();
	await expect(section.getByRole("alert")).toHaveCount(0);
	await assertNoHorizontalOverflow(page);
});

test("payment link save failure stays generic and keeps the draft", async ({ page, mockApi }) => {
	mockApi.mock("PATCH", "/api/debug/admin/settings", {
		status: 422,
		body: { detail: "private persistence diagnostic" },
	});
	await page.goto("/admin/settings/tribute/payment-links");
	const subscription = page.getByLabel("Supporter");
	await subscription.fill("https://pay.example.test/subscription");
	await page.getByRole("button", { name: "Save payment links", exact: true }).click();

	await expect(page.getByRole("alert")).toContainText("Could not save payment links");
	await expect(page.getByText("private persistence diagnostic")).toHaveCount(0);
	await expect(subscription).toHaveValue("https://pay.example.test/subscription");
	await expect(page.getByRole("button", { name: "Save payment links", exact: true })).toBeEnabled();
});

test("admin creates and previews flexible donation amount bands without executing access", async ({
	page,
	mockApi,
}) => {
	await page.goto("/admin/settings/tribute/automation-rules");
	await page.getByRole("button", { name: "Create first rule" }).click();
	await expect(page.getByRole("heading", { name: "Create automation rule" })).toBeVisible();

	await page.getByLabel("Rule name").fill("Donation access");
	await page.getByLabel("Starts at").fill("500");
	await page.getByLabel("Payment unit").fill("500");
	await page.getByLabel("Access per unit").fill("30");
	await page.getByRole("button", { name: "Add band" }).click();
	await page.getByLabel("Starts at").nth(1).fill("3500");
	await page.getByLabel("Payment unit").nth(1).fill("3500");
	await page.getByLabel("Access per unit").nth(1).fill("365");

	await page.getByLabel("Payment amount (RUB)").fill("4000");
	await page.getByRole("button", { name: "Preview", exact: true }).click();
	await expect(page.getByText("417 access days", { exact: true })).toBeVisible();
	await expect(page.getByText(/Matched threshold:/)).toContainText("3,500");
	await expect(
		page.getByText(/Subscriptions synchronize Tribute's exact expiration/),
	).toBeVisible();
	expect(mockApi.calls).not.toContain("PUT /api/debug/admin/commerce/rules");

	await submitEditor(page.getByRole("dialog", { name: "Create automation rule" }));
	await expect(page.getByRole("heading", { name: "Create automation rule" })).toHaveCount(0);
	await expect(page.getByText("Donation access", { exact: true })).toBeVisible();
	await expect(page.getByText(/From .*500/)).toBeVisible();
	expect(
		mockApi.calls.filter((call) => call === "POST /api/debug/admin/commerce/rules"),
	).toHaveLength(1);

	await page.reload();
	await expect(page.getByText("Donation access", { exact: true })).toBeVisible();
	await assertNoHorizontalOverflow(page);
});

test("rule editor selects Tribute subscriptions by catalog name and price", async ({
	page,
	mockApi: _mock,
}) => {
	await page.goto("/admin/settings/tribute/automation-rules");
	await page.getByRole("button", { name: "Create first rule" }).click();
	await page.getByRole("radio", { name: "Subscription", exact: true }).click();

	const offer = page.getByLabel("Tribute offer");
	await expect(offer).toBeEnabled();
	await expect(offer.locator("option").first()).toHaveText("Select a subscription");
	await expect(offer.locator('option[value="12"]')).toContainText("Supporter");
	await expect(offer.locator('option[value="12"]')).toContainText("500.00 / month");
	await expect(offer.locator('option[value="12"]')).toContainText("3,500.00 / year");
	await offer.selectOption("12");
	await expect(page.getByLabel("Rule name")).toHaveValue("Supporter");
	await expect(page.getByLabel("Currency")).toHaveValue("RUB");
	await expect(page.getByLabel("Currency")).toHaveAttribute("readonly", "");

	const accessibility = await new AxeBuilder({ page }).analyze();
	expect(
		accessibility.violations.filter((violation) =>
			["serious", "critical"].includes(violation.impact ?? ""),
		),
	).toEqual([]);
	await assertNoHorizontalOverflow(page);
});

test("subscription rule uses Tribute expiry without local day calculation", async ({
	page,
	mockApi: _mock,
}, testInfo) => {
	for (const colorScheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
		await page.goto("/admin/settings/tribute/automation-rules");
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		await page.getByRole("button", { name: "Create first rule" }).click();
		await page.getByRole("radio", { name: "Subscription", exact: true }).click();
		await page.getByLabel("Tribute offer").selectOption("12");

		const editor = page.getByLabel("Create automation rule");
		const providerExpiry = editor.getByText("One benefits profile for every billing option", {
			exact: true,
		});
		await expect(providerExpiry).toBeVisible();
		await expect(editor.getByLabel("Sponsor benefits profile")).toBeVisible();
		await expect(editor.getByText(/signed expires_at as the exact end date/)).toBeVisible();
		await expect(editor.getByText(/create separate Tribute subscriptions/)).toBeVisible();
		await expect(editor.getByText("Activation policy", { exact: true })).toHaveCount(0);
		await expect(editor.getByText("Duration calculation", { exact: true })).toHaveCount(0);
		await expect(editor.getByText("Rule preview", { exact: true })).toHaveCount(0);
		const accessibility = await new AxeBuilder({ page }).analyze();
		expect(
			accessibility.violations.filter((violation) =>
				["serious", "critical"].includes(violation.impact ?? ""),
			),
		).toEqual([]);
		await assertNoHorizontalOverflow(page);
		await providerExpiry.scrollIntoViewIfNeeded();
		await page.screenshot({
			path: testInfo.outputPath(`subscription-rule-${colorScheme}.png`),
		});
		if (colorScheme === "light") {
			await editor.getByRole("button", { name: "Close rule editor" }).click();
		} else {
			await submitEditor(editor);
		}
	}

	await expect(page.getByRole("button", { name: /Supporter/ })).toBeVisible();
	await expect(page.getByText("Expiration synced with Tribute", { exact: true })).toBeVisible();
	await assertNoHorizontalOverflow(page);
});

test("catalog failure is safe and retry restores the offer picker", async ({ page, mockApi }) => {
	mockApi.mock("GET", "/api/debug/admin/commerce/catalog", [
		{ status: 503, body: { detail: "private catalog diagnostic" } },
		{ status: 503, body: { detail: "private catalog diagnostic" } },
		{ body: mockData.commerceCatalog },
	]);

	await page.goto("/admin/settings/tribute/automation-rules");
	await page.getByRole("button", { name: "Create first rule" }).click();
	await page.getByRole("radio", { name: "Subscription", exact: true }).click();
	const editor = page.getByLabel("Create automation rule");
	await expect(editor.getByRole("alert")).toContainText("Could not load the Tribute catalog");
	await expect(page.getByText("private catalog diagnostic")).toHaveCount(0);
	await expect(page.getByLabel("Tribute offer")).toBeDisabled();

	await editor.getByRole("button", { name: "Retry", exact: true }).click();
	await expect(page.getByLabel("Tribute offer")).toBeEnabled();
	await expect(page.getByLabel("Tribute offer").locator('option[value="12"]')).toHaveCount(1);
	await assertNoHorizontalOverflow(page);
});

test("an existing rule keeps a Tribute item missing from the current catalog", async ({
	page,
	mockApi,
}) => {
	await installTelegramMainButton(page);
	mockApi.seedCommerceRules([
		{
			id: "10000000-0000-4000-8000-000000000099",
			provider: "tribute",
			name: "Legacy subscription",
			commerceType: "subscription",
			paymentMode: "recurring",
			externalItemId: "999",
			currency: "RUB",
			calculationType: "provider_expiry",
			fixedDurationDays: null,
			amountBands: [],
			accessProfileId: mockData.accessProfiles[0].id,
			grantMode: "replace",
			priority: 100,
			isEnabled: true,
		},
	]);

	await page.goto(withTelegramMainButton("/admin/settings/tribute/automation-rules"));
	await page.getByRole("button", { name: /Legacy subscription/ }).click();
	const offer = page.getByLabel("Tribute offer");
	await expect(offer).toHaveValue("999");
	await expect(offer.locator('option[value="999"]')).toHaveText("Current Tribute item · ID 999");
	await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
	await expect
		.poll(() => latestTelegramMainButton(page))
		.toEqual(expect.objectContaining({ text: "Save", is_active: true, is_visible: true }));
});

test("payment activity exposes loading, failure recovery, and a safe empty state", async ({
	page,
	mockApi,
}) => {
	mockApi.mock("GET", "/api/debug/admin/commerce/operations", [
		{ status: 503, body: { detail: "private activity diagnostic" } },
		{ status: 503, body: { detail: "private activity diagnostic" } },
		{ delayMs: 600, body: { operations: [], hasMore: false } },
	]);
	await page.goto("/admin/settings/tribute/activity");

	await expect(page.getByRole("alert")).toContainText("Could not load payment activity");
	await expect(page.getByText("private activity diagnostic")).toHaveCount(0);
	await page.getByRole("button", { name: "Retry", exact: true }).click();
	await expect(
		page.locator('[data-ui="loading-skeleton"]:not([data-skeleton-variant])'),
	).toBeVisible();
	await expect(page.getByText("No events yet", { exact: true })).toBeVisible();
	await assertNoHorizontalOverflow(page);
});

test("payment activity renders allow-listed applied and review outcomes", async ({
	page,
	mockApi,
}, testInfo) => {
	mockApi.mock("GET", "/api/debug/admin/commerce/operations", {
		body: {
			operations: [
				entitlementOperation(),
				entitlementOperation({
					id: "20000000-0000-4000-8000-000000000003",
					eventName: "effective_access_restore",
					operationKind: "restore",
					status: "pending",
					externalItemId: null,
					amountMinor: null,
					currency: null,
					durationDays: null,
					targetExpiry: "2027-08-14T10:00:00Z",
				}),
				entitlementOperation({
					id: "20000000-0000-4000-8000-000000000002",
					eventName: "new_donation",
					operationKind: "review",
					status: "review",
					reasonCode: "semantic_identity_unverified",
					telegramUserId: null,
					externalItemId: "12",
					amountMinor: 100000,
					durationDays: null,
					targetExpiry: null,
					attemptCount: 0,
					availableActions: ["resolve"],
				}),
			],
			hasMore: true,
		},
	});
	await page.goto("/admin/settings/tribute/activity");

	await expect(page.getByText("Subscription started", { exact: true })).toBeVisible();
	await expect(page.getByText("Applied", { exact: true })).toBeVisible();
	await expect(page.getByText("Base access restoration", { exact: true })).toBeVisible();
	await expect(page.getByText("Queued", { exact: true })).toBeVisible();
	await expect(page.getByText("One-time donation", { exact: true })).toBeVisible();
	await expect(page.getByText("Needs review", { exact: true })).toBeVisible();
	await expect(page.getByText(/does not document a unique ID/)).toBeVisible();
	await expect(
		page.getByText("Showing the 20 most recent operations", { exact: true }),
	).toBeVisible();
	await assertNoHorizontalOverflow(page);
	await page.getByRole("heading", { name: "Payment activity" }).evaluate((element) => {
		element.scrollIntoView({ block: "start" });
	});
	for (const colorScheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		await page.screenshot({ path: testInfo.outputPath(`payment-activity-${colorScheme}.png`) });
	}
});

test("admin resolution is explicit, audited, idempotent across retry, and returns focus", async ({
	page,
	mockApi,
	browserName,
}) => {
	const operation = entitlementOperation({
		operationKind: "review",
		status: "review",
		reasonCode: "semantic_identity_unverified",
		availableActions: ["resolve"],
	});
	const resolved = entitlementOperation({
		...operation,
		status: "resolved",
		reasonCode: "operator_resolved",
		availableActions: [],
		lastAction: {
			action: "resolve",
			note: "Verified in the provider dashboard",
			createdAt: "2026-08-14T10:05:00Z",
		},
	});
	mockApi.mock("GET", "/api/debug/admin/commerce/operations", [
		{ body: { operations: [operation], hasMore: false } },
		{ body: { operations: [resolved], hasMore: false } },
	]);
	mockApi.mock("POST", /\/api\/debug\/admin\/commerce\/operations\/[^/]+\/actions$/, [
		{ status: 503, body: { detail: "private operator diagnostic" } },
		{ body: resolved },
	]);
	const requests: Array<Record<string, unknown>> = [];
	page.on("request", (request) => {
		if (request.method() === "POST" && new URL(request.url()).pathname.endsWith("/actions")) {
			requests.push(request.postDataJSON() as Record<string, unknown>);
		}
	});

	await page.goto("/admin/settings/tribute/activity");
	const resolveButton = page.getByRole("button", { name: "Resolve", exact: true });
	await resolveButton.click();
	const dialog = page.getByRole("dialog", { name: "Resolve without changing access?" });
	await expect(dialog).toBeVisible();
	await expect(
		dialog.getByRole("heading", { name: "Resolve without changing access?" }),
	).toBeFocused();
	await expect(dialog.getByRole("button", { name: "Close" })).not.toBeFocused();
	await expect(dialog.getByRole("button", { name: "Resolve", exact: true })).toBeDisabled();
	await expect
		.poll(() =>
			dialog.evaluate(
				(element) =>
					element
						.getAnimations({ subtree: true })
						.filter((animation) => animation.playState !== "finished").length,
			),
		)
		.toBe(0);
	const accessibility = await new AxeBuilder({ page }).analyze();
	expect(
		accessibility.violations.filter((violation) =>
			["serious", "critical"].includes(violation.impact ?? ""),
		),
	).toEqual([]);
	await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
	if (browserName !== "webkit") await expect(resolveButton).toBeFocused();

	await resolveButton.click();
	await page.getByLabel("Resolution note").fill("  Verified in the provider dashboard  ");
	const confirm = dialog.getByRole("button", { name: "Resolve", exact: true });
	await confirm.click();
	await expect(dialog.getByRole("alert")).toContainText("Could not save this decision");
	await expect(page.getByLabel("Resolution note")).toHaveAttribute("readonly", "");
	await expect(page.getByText("private operator diagnostic")).toHaveCount(0);
	const scrollBeforeResolve = await page.evaluate(() => window.scrollY);
	await confirm.click();

	await expect(dialog).toHaveCount(0);
	const resolvedEntry = page.getByRole("article").filter({ hasText: "Resolved" });
	await expect(resolvedEntry).toBeFocused();
	await expect(resolvedEntry.getByText("Resolved", { exact: true })).toBeVisible();
	await expect(
		resolvedEntry.getByText(/Resolution: Verified in the provider dashboard/),
	).toBeVisible();
	await expect(page.getByText("The review was resolved without changing access.")).toHaveCount(0);
	await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scrollBeforeResolve);
	expect(requests).toHaveLength(2);
	expect(requests[0]).toMatchObject({
		action: "resolve",
		note: "Verified in the provider dashboard",
	});
	expect(requests[1]).toEqual(requests[0]);
	await assertNoHorizontalOverflow(page);
});

test("provider failures expose only the server-approved retry and resolve decisions", async ({
	page,
	mockApi,
}) => {
	const operation = entitlementOperation({
		operationKind: "grant",
		status: "review",
		reasonCode: "provider_unavailable",
		availableActions: ["retry", "resolve"],
	});
	const retried = entitlementOperation({
		...operation,
		status: "retry",
		reasonCode: "operator_retry_queued",
		availableActions: [],
		lastAction: {
			action: "retry",
			note: null,
			createdAt: "2026-08-14T10:05:00Z",
		},
	});
	mockApi.mock("GET", "/api/debug/admin/commerce/operations", [
		{ body: { operations: [operation], hasMore: false } },
		{ body: { operations: [retried], hasMore: false } },
	]);
	mockApi.mock("POST", /\/api\/debug\/admin\/commerce\/operations\/[^/]+\/actions$/, {
		body: retried,
	});

	await page.goto("/admin/settings/tribute/activity");
	await expect(page.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
	await expect(page.getByRole("button", { name: "Resolve", exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Retry", exact: true }).click();
	const dialog = page.getByRole("dialog", { name: "Queue another provider attempt?" });
	await expect(dialog).toContainText(
		"Flowvy will make one more idempotent provider attempt using the stored plan",
	);
	const scrollBeforeRetry = await page.evaluate(() => window.scrollY);
	await dialog.getByRole("button", { name: "Queue retry", exact: true }).click();
	const retryEntry = page.getByRole("article").filter({ hasText: "Retry scheduled" });
	await expect(retryEntry).toBeFocused();
	await expect(retryEntry.getByText("Retry scheduled", { exact: true })).toBeVisible();
	await expect(retryEntry.getByText("An administrator queued another attempt")).toBeVisible();
	await expect(page.getByText("The provider retry was queued.")).toHaveCount(0);
	await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(scrollBeforeRetry);
	await assertNoHorizontalOverflow(page);
});

test("resolution closes the native dialog immediately after success", async ({ page, mockApi }) => {
	const operation = entitlementOperation({
		operationKind: "review",
		status: "review",
		reasonCode: "semantic_identity_unverified",
		availableActions: ["resolve"],
	});
	const resolved = entitlementOperation({
		...operation,
		status: "resolved",
		reasonCode: "operator_resolved",
		availableActions: [],
		lastAction: {
			action: "resolve",
			note: "Verified in Tribute",
			createdAt: "2026-08-14T10:05:00Z",
		},
	});
	mockApi.mock("GET", "/api/debug/admin/commerce/operations", [
		{ body: { operations: [operation], hasMore: false } },
		{ body: { operations: [resolved], hasMore: false } },
	]);
	mockApi.mock("POST", /\/api\/debug\/admin\/commerce\/operations\/[^/]+\/actions$/, {
		body: resolved,
		delayMs: 120,
	});

	await page.goto("/admin/settings/tribute/activity");
	await page.getByRole("button", { name: "Resolve", exact: true }).click();
	const dialog = page.getByRole("dialog", { name: "Resolve without changing access?" });
	const note = page.getByLabel("Resolution note");
	await note.fill("Verified in Tribute");
	await note.focus();

	await page.evaluate(() => {
		const nativeDialog = document.querySelector("dialog");
		if (!nativeDialog) throw new Error("Expected an open native dialog");
		const record = { observed: false, openAtRemoval: null as boolean | null };
		const observer = new MutationObserver(() => {
			if (nativeDialog.isConnected) return;
			record.observed = true;
			record.openAtRemoval = nativeDialog.open;
			observer.disconnect();
		});
		observer.observe(document.body, { childList: true, subtree: true });
		Object.defineProperty(window, "__dialogRemovalRecord", {
			configurable: true,
			value: record,
		});
	});

	await dialog.getByRole("button", { name: "Resolve", exact: true }).click();
	await expect(page.getByText("Resolved", { exact: true })).toBeVisible();
	await expect(dialog).toHaveCount(0);
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					(
						window as typeof window & {
							__dialogRemovalRecord: { observed: boolean; openAtRemoval: boolean | null };
						}
					).__dialogRemovalRecord,
			),
		)
		.toEqual({ observed: true, openAtRemoval: false });
	await assertNoHorizontalOverflow(page);
});

test("reported donation draft keeps auth, clears stale errors, and previews after retry", async ({
	page,
	mockApi,
}) => {
	mockApi.mock("POST", "/api/debug/admin/commerce/preview", [
		{ status: 401, body: { detail: "private authentication diagnostic" } },
		{
			body: {
				matched: true,
				durationDays: 5,
				matchedBand: {
					fromAmountMinor: 50_000,
					unitAmountMinor: 349_900,
					unitDays: 30,
				},
			},
		},
	]);
	await page.goto("/admin/settings/tribute/automation-rules");
	await page.getByRole("button", { name: "Create first rule" }).click();
	await page.getByLabel("Rule name").fill("1");
	await page.getByLabel("Starts at").fill("500");
	await page.getByLabel("Payment unit").fill("3499");
	await page.getByLabel("Access per unit").fill("30");
	await page.getByLabel("Payment amount (RUB)").fill("500");

	const firstRequest = page.waitForRequest(
		(request) =>
			request.method() === "POST" &&
			new URL(request.url()).pathname === "/api/debug/admin/commerce/preview",
	);
	await page.getByRole("button", { name: "Preview", exact: true }).click();
	const request = await firstRequest;
	expect(request.postDataJSON()).toMatchObject({
		rule: {
			name: "1",
			amountBands: [{ fromAmountMinor: 50_000, unitAmountMinor: 349_900, unitDays: 30 }],
		},
		amountMinor: 50_000,
	});
	await expect(page.getByRole("alert")).toContainText("Telegram session expired");
	await expect(page.getByText("private authentication diagnostic")).toHaveCount(0);

	const retryAmount = page.getByLabel("Payment amount (RUB)");
	await retryAmount.fill("600");
	await expect(page.getByText("Telegram session expired")).toHaveCount(0);
	await retryAmount.press("Enter");
	await expect(retryAmount).not.toBeFocused();
	await expect(page.getByText("5 access days", { exact: true })).toBeVisible();
	await assertNoHorizontalOverflow(page);
});

test("rule editor keeps native controls and actions stable while inputs are focused", async ({
	page,
	mockApi: _mock,
}) => {
	await page.goto("/admin/settings/tribute/automation-rules");
	await page.getByRole("button", { name: "Create first rule" }).click();
	const dialog = page.getByRole("dialog", { name: "Create automation rule" });
	const currency = page.getByLabel("Currency");
	const priority = page.getByLabel("Priority");
	const [currencyBox, priorityBox] = await Promise.all([
		currency.boundingBox(),
		priority.boundingBox(),
	]);
	expect(currencyBox).not.toBeNull();
	expect(priorityBox).not.toBeNull();
	expect(currencyBox?.height).toBeLessThanOrEqual(48);
	const viewportWidth = await page.evaluate(() => window.innerWidth);
	if (viewportWidth > 350) {
		expect(Math.abs((currencyBox?.y ?? 0) - (priorityBox?.y ?? 0))).toBeLessThanOrEqual(2);
	} else {
		expect(priorityBox?.y ?? 0).toBeGreaterThan((currencyBox?.y ?? 0) + (currencyBox?.height ?? 0));
	}

	const firstBand = dialog.getByRole("group", { name: "Band 1" });
	await expect(firstBand.getByLabel("Starts at")).toBeVisible();
	await expect(firstBand.getByLabel("Payment unit")).toBeVisible();
	await expect(firstBand.getByLabel("Access per unit")).toBeVisible();
	const bandBox = await firstBand.boundingBox();
	expect(bandBox).not.toBeNull();
	expect(bandBox?.height).toBeLessThanOrEqual(230);

	const focusedInput = page.getByLabel("Payment amount (RUB)");
	await focusedInput.focus();
	await page.keyboard.type("500");
	await expect(focusedInput).toBeFocused();
	await expect(focusedInput).toHaveValue("500");
	const footer = dialog.locator("footer");
	await expect(footer).toHaveCount(0);
	await expect(page.getByRole("navigation")).toHaveCount(0);
	await focusedInput.blur();
	await assertNoHorizontalOverflow(page);
});

test("saved rule can be disabled, edited, and deleted with explicit confirmation", async ({
	page,
	mockApi,
}) => {
	const ruleId = "10000000-0000-4000-8000-000000000001";
	mockApi.seedCommerceRules([
		{
			id: ruleId,
			provider: "tribute",
			name: "Monthly donation access",
			commerceType: "donation",
			paymentMode: "any",
			externalItemId: null,
			currency: "RUB",
			calculationType: "fixed",
			fixedDurationDays: 30,
			amountBands: [],
			accessProfileId: "00000000-0000-4000-8000-000000000001",
			grantMode: "extend",
			priority: 100,
			isEnabled: true,
		},
	]);
	mockApi.seedSponsorOffers([
		{
			...sponsorDonationOffer(),
			commerceRuleId: ruleId,
			title: "Linked support choice",
		},
	]);
	await page.goto("/admin/settings/tribute/automation-rules");

	const toggle = page.getByRole("switch", { name: "Enable or disable Monthly donation access" });
	await toggle.click();
	await expect(toggle).toHaveAttribute("aria-checked", "false");

	await page.getByRole("button", { name: /Monthly donation access/ }).click();
	const ruleDialog = page.getByRole("dialog", { name: "Edit automation rule" });
	const ruleName = page.getByLabel("Rule name");
	await ruleName.fill("Updated donation access");
	await ruleName.press("Enter");
	await expect(page.getByLabel("Currency")).toBeFocused();
	await expect(ruleDialog).toBeVisible();
	await submitEditor(ruleDialog);
	await expect(page.getByText("Updated donation access", { exact: true })).toBeVisible();

	await page.getByRole("button", { name: /Updated donation access/ }).click();
	await page
		.getByRole("dialog", { name: "Edit automation rule" })
		.getByRole("button", { name: "Delete", exact: true })
		.click();
	const confirmation = page
		.getByRole("heading", { name: "Delete automation rule?" })
		.locator("xpath=ancestor::dialog[1]");
	await expect(confirmation).toContainText(/payment choices linked to it will be removed/);
	await expect(confirmation).toContainText(
		/Pending payments will no longer be matched automatically/,
	);
	await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
	await expect(confirmation).toHaveCount(0);
	await expect(
		page
			.getByRole("dialog", { name: "Edit automation rule" })
			.getByRole("button", { name: "Delete", exact: true }),
	).toBeFocused();
	await page
		.getByRole("dialog", { name: "Edit automation rule" })
		.getByRole("button", { name: "Delete", exact: true })
		.click();
	const reopenedConfirmation = page
		.getByRole("heading", { name: "Delete automation rule?" })
		.locator("xpath=ancestor::dialog[1]");
	await reopenedConfirmation.getByRole("button", { name: "Delete", exact: true }).click();
	await expect(page.getByText("No automation rules", { exact: true })).toBeVisible();
	await page.goto("/admin/settings/tribute/sponsor-offers");
	await expect(page.getByRole("article", { name: "Linked support choice" })).toHaveCount(0);
	expect(mockApi.calls).toContain(`DELETE /api/debug/admin/commerce/rules/${ruleId}`);
});

test("rule delete failure stays retryable and hides backend diagnostics", async ({
	page,
	mockApi,
}) => {
	const rule = sponsorDonationRule();
	const offer = { ...sponsorDonationOffer(), commerceRuleId: rule.id };
	mockApi.seedCommerceRules([rule]);
	mockApi.seedSponsorOffers([offer]);
	mockApi.mock("DELETE", `/api/debug/admin/commerce/rules/${rule.id}`, {
		status: 503,
		body: { detail: "private database diagnostic" },
		delayMs: 400,
	});
	await page.goto("/admin/settings/tribute/automation-rules");
	await page.getByRole("button", { name: /Flexible sponsor donations/ }).click();
	await page
		.getByRole("dialog", { name: "Edit automation rule" })
		.getByRole("button", { name: "Delete", exact: true })
		.click();
	const confirmation = page
		.getByRole("heading", { name: "Delete automation rule?" })
		.locator("xpath=ancestor::dialog[1]");
	const deleteButton = confirmation.getByRole("button", { name: "Delete", exact: true });
	await deleteButton.click();
	await expect(deleteButton).toHaveAttribute("aria-busy", "true");
	await expect(deleteButton).toBeDisabled();
	await expect(confirmation.getByRole("alert")).toContainText(
		"Could not delete the automation rule. Try again",
	);
	await expect(confirmation.getByText("private database diagnostic")).toHaveCount(0);
	await expect(page.getByRole("button", { name: /Flexible sponsor donations/ })).toBeVisible();
});

test("rule editor exposes safe no-match and save-failure states", async ({ page, mockApi }) => {
	await installTelegramMainButton(page);
	mockApi.mock("POST", "/api/debug/admin/commerce/rules", {
		status: 422,
		body: { detail: "private persistence diagnostic" },
		delayMs: 600,
	});
	await page.goto(withTelegramMainButton("/admin/settings/tribute/automation-rules"));
	await page.getByRole("button", { name: "Create first rule" }).click();
	await page.getByLabel("Rule name").fill("Donation access");
	await page.getByLabel("Starts at").fill("500");
	await page.getByLabel("Payment unit").fill("500");
	await page.getByLabel("Access per unit").fill("30");
	await page.getByLabel("Payment amount (RUB)").fill("100");
	await page.getByRole("button", { name: "Preview", exact: true }).click();
	await expect(page.getByText("No matching amount band", { exact: true })).toBeVisible();

	await expect(page.getByRole("button", { name: "Create rule", exact: true })).toHaveCount(0);
	await pressTelegramMainButton(page);
	await expect
		.poll(() => latestTelegramMainButton(page))
		.toEqual(expect.objectContaining({ is_active: false, is_progress_visible: true }));
	const saveError = page
		.getByRole("alert")
		.filter({ hasText: "Could not save the automation rule" });
	await expectActionErrorRevealed(saveError);
	await expect(page.getByText("private persistence diagnostic")).toHaveCount(0);
});

test("commerce rules expose loading, load-error, and unavailable-profile states", async ({
	page,
	mockApi,
}) => {
	await installTelegramMainButton(page);
	mockApi.mock("GET", "/api/debug/admin/commerce/rules", {
		delayMs: 600,
		body: [],
	});
	await page.goto(withTelegramMainButton("/admin/settings/tribute/automation-rules"));
	await expect(
		page.locator('[data-ui="loading-skeleton"]:not([data-skeleton-variant])'),
	).toBeVisible();
	await expect(page.getByText("No automation rules", { exact: true })).toBeVisible();

	mockApi.mock("GET", "/api/debug/admin/commerce/rules", {
		status: 502,
		body: { detail: "private list diagnostic" },
	});
	await page.reload();
	await expect(page.getByText(/Could not load automation rules or access profiles/)).toBeVisible();
	await expect(page.getByText("private list diagnostic")).toHaveCount(0);

	mockApi.mock("GET", "/api/debug/admin/registration/access-profiles", {
		body: [{ ...mockData.accessProfiles[0], isActive: false }],
	});
	mockApi.seedCommerceRules([
		{
			id: "10000000-0000-4000-8000-000000000001",
			provider: "tribute",
			name: "Rule needing attention",
			commerceType: "donation",
			paymentMode: "any",
			externalItemId: null,
			currency: "RUB",
			calculationType: "fixed",
			fixedDurationDays: 30,
			amountBands: [],
			accessProfileId: "00000000-0000-4000-8000-000000000001",
			grantMode: "extend",
			priority: 100,
			isEnabled: true,
		},
	]);
	mockApi.mock("GET", "/api/debug/admin/commerce/rules", {
		body: [
			{
				id: "10000000-0000-4000-8000-000000000001",
				provider: "tribute",
				name: "Rule needing attention",
				commerceType: "donation",
				paymentMode: "any",
				externalItemId: null,
				currency: "RUB",
				calculationType: "fixed",
				fixedDurationDays: 30,
				amountBands: [],
				accessProfileId: "00000000-0000-4000-8000-000000000001",
				grantMode: "extend",
				priority: 100,
				isEnabled: true,
			},
		],
	});
	await page.reload();
	await expect(page.getByText("Access profile unavailable", { exact: true })).toBeVisible();
	await page.getByRole("button", { name: /Rule needing attention/ }).click();
	await expect(page.getByRole("alert")).toContainText(
		"Create or activate an access profile before saving",
	);
	await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
	await expect
		.poll(() => latestTelegramMainButton(page))
		.toEqual(expect.objectContaining({ text: "Save", is_active: false, is_visible: true }));
});

test("Tribute settings pass serious accessibility and overflow checks", async ({
	page,
	mockApi,
}) => {
	mockApi.seedCommerceRules([sponsorSubscriptionRule()]);
	for (const colorScheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
		await page.goto("/admin/settings/tribute");
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		await expect(page.getByRole("main").locator(":scope > div")).toHaveCSS("opacity", "1");
		const result = await new AxeBuilder({ page }).analyze();
		const serious = result.violations.filter((violation) =>
			["serious", "critical"].includes(violation.impact ?? ""),
		);
		expect(serious).toEqual([]);
		await assertNoHorizontalOverflow(page);
	}
});

test("payment links produce reviewable light and dark browser evidence", async ({
	page,
	mockApi,
}, testInfo) => {
	mockApi.seedSettings({
		tributeDonationUrl: "https://pay.example.test/donation",
		tributeSubscriptionUrls: {
			"12": "https://t.me/tribute/app?startapp=subscription_12",
		},
	});

	for (const colorScheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
		await page.goto("/admin/settings/tribute/payment-links");
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		await page.getByRole("heading", { name: "Payment links" }).evaluate((element) => {
			element.scrollIntoView({ block: "start" });
		});
		await expect(page.getByLabel("Donation link")).toHaveCount(0);
		await page.screenshot({ path: testInfo.outputPath(`payment-links-${colorScheme}.png`) });
		await assertNoHorizontalOverflow(page);
	}
});

test("commerce rule editor is accessible and responsive in both themes", async ({
	page,
	mockApi: _mock,
}) => {
	test.setTimeout(60_000);
	for (const viewport of [
		{ width: 320, height: 568 },
		{ width: 1024, height: 768 },
	]) {
		for (const colorScheme of ["light", "dark"] as const) {
			await page.setViewportSize(viewport);
			await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
			await page.goto("/admin/settings/tribute/automation-rules");
			await page.evaluate((theme) => {
				document.documentElement.setAttribute("data-theme", theme);
			}, colorScheme);
			await page.getByRole("button", { name: "Create first rule" }).click();
			const dialog = page.getByRole("dialog", { name: "Create automation rule" });
			await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toHaveCount(0);
			const result = await new AxeBuilder({ page }).analyze();
			const serious = result.violations.filter((violation) =>
				["serious", "critical"].includes(violation.impact ?? ""),
			);
			expect(serious).toEqual([]);
			await assertNoHorizontalOverflow(page);
			await page.getByRole("button", { name: "Close rule editor" }).click();
		}
	}
});

test("rule deletion consequence is accessible in light and dark themes", async ({
	page,
	mockApi,
}, testInfo) => {
	const rule = sponsorDonationRule();
	mockApi.seedCommerceRules([rule]);
	mockApi.seedSponsorOffers([{ ...sponsorDonationOffer(), commerceRuleId: rule.id }]);
	const accessibilityByTheme: Array<{ theme: "light" | "dark"; serious: unknown[] }> = [];

	for (const colorScheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
		await page.goto("/admin/settings/tribute/automation-rules");
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		await page.getByRole("button", { name: /Flexible sponsor donations/ }).click();
		await page
			.getByRole("dialog", { name: "Edit automation rule" })
			.getByRole("button", { name: "Delete", exact: true })
			.click();
		const confirmation = page
			.getByRole("heading", { name: "Delete automation rule?" })
			.locator("xpath=ancestor::dialog[1]");
		await expect(confirmation).toContainText(/payment choices linked to it will be removed/);
		await expect(
			page
				.getByRole("dialog", { name: "Edit automation rule" })
				.getByRole("button", { name: "Delete", exact: true }),
		).toHaveCSS("color", colorScheme === "dark" ? "rgb(255, 85, 74)" : "rgb(198, 53, 42)");
		const result = await new AxeBuilder({ page }).analyze();
		const serious = result.violations.filter((violation) =>
			["serious", "critical"].includes(violation.impact ?? ""),
		);
		accessibilityByTheme.push({ theme: colorScheme, serious });
		await assertNoHorizontalOverflow(page);
		await page.screenshot({ path: testInfo.outputPath(`rule-delete-${colorScheme}.png`) });
		await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
	}
	expect(accessibilityByTheme.filter(({ serious }) => serious.length > 0)).toEqual([]);
});

test("admin creates a user-facing sponsor offer from an automation rule", async ({
	page,
	mockApi,
}, testInfo) => {
	mockApi.seedCommerceRules([sponsorSubscriptionRule()]);

	await page.goto("/admin/settings/tribute/sponsor-offers");
	await expect(page.getByRole("heading", { name: "Sponsor offers" })).toBeVisible();
	await page.getByRole("button", { name: "Create first offer" }).click();
	await expect(page.getByRole("heading", { name: "Create sponsor offer" })).toBeVisible();
	await page.getByLabel("Offer title").fill("Monthly sponsor access");
	await expect(page.getByLabel("Description").locator("p").first()).toHaveAttribute(
		"data-placeholder",
		"Enter the message shown under this offer",
	);
	await page.getByLabel("Description").fill("Automatic monthly support with extended access.");
	const publish = page.getByRole("switch", { name: "Publish this sponsor offer" });
	await expect(publish).toHaveAttribute("aria-disabled", "true");
	await expect(
		page.getByText(
			"Add a Tribute payment link for this subscription in Payment links before making it visible on Home",
			{ exact: true },
		),
	).toBeVisible();
	await publish.focus();
	await expect(publish).toBeFocused();
	await publish.press("Space");
	await expect(publish).not.toBeChecked();
	await expect(page.getByText("Payment options from Tribute", { exact: true })).toBeVisible();
	await expect(page.getByText(/user chooses one on the Tribute checkout screen/)).toBeVisible();
	const accessibilityByTheme: Array<{ theme: "light" | "dark"; serious: unknown[] }> = [];
	for (const colorScheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		const accessibility = await new AxeBuilder({ page }).analyze();
		const serious = accessibility.violations.filter((violation) =>
			["serious", "critical"].includes(violation.impact ?? ""),
		);
		accessibilityByTheme.push({ theme: colorScheme, serious });
		await assertNoHorizontalOverflow(page);
		await page
			.getByRole("dialog", { name: "Create sponsor offer" })
			.screenshot({ path: testInfo.outputPath(`missing-destination-${colorScheme}.png`) });
	}
	expect(accessibilityByTheme.filter(({ serious }) => serious.length > 0)).toEqual([]);
	await page.getByRole("heading", { name: "Payment and access" }).click();
	const createRequest = page.waitForRequest(
		(request) =>
			request.method() === "POST" &&
			new URL(request.url()).pathname === "/api/debug/admin/commerce/offers",
	);
	await submitEditor(page.getByRole("dialog", { name: "Create sponsor offer" }));
	const createPayload = (await createRequest).postDataJSON();
	expect(createPayload.contentLocales.en.title).toBe("Monthly sponsor access");
	expect(createPayload.contentLocales.ru.title).toBe("Расширенный доступ");

	await expect(page.getByRole("heading", { name: "Create sponsor offer" })).toHaveCount(0);
	const createdOffer = page.getByRole("article", { name: "Monthly sponsor access" });
	await expect(createdOffer).toBeVisible();
	await expect(createdOffer.getByText("Billed monthly", { exact: true })).toBeVisible();
	await expect(createdOffer.getByText("Billed yearly", { exact: true })).toBeVisible();
	await expect(createdOffer).toContainText("500");
	await expect(createdOffer).toContainText("3,500");
	await expect(createdOffer.getByRole("button", { name: "Edit" })).toBeVisible();
	expect(mockApi.calls).toContain("POST /api/debug/admin/commerce/offers");
	await assertNoHorizontalOverflow(page);
});

test("sponsor offer maps a stale missing-destination response to actionable copy", async ({
	page,
	mockApi,
}, testInfo) => {
	mockApi.seedCommerceRules([sponsorSubscriptionRule()]);
	mockApi.mock("POST", "/api/debug/admin/commerce/offers", {
		status: 422,
		body: {
			detail: {
				code: "tribute_subscription_destination_missing",
				message: "Tribute subscription destination is not configured",
			},
		},
	});

	await page.goto("/admin/settings/tribute/payment-links");
	await page
		.getByLabel("Supporter", { exact: true })
		.fill("https://t.me/tribute/app?startapp=subscription_12");
	await page.getByRole("button", { name: "Save payment links", exact: true }).click();
	await expect(page.getByText("Payment links saved", { exact: true })).toBeVisible();
	await page.goto("/admin/settings/tribute/sponsor-offers");
	await page.getByRole("button", { name: "Create first offer" }).click();
	await page.getByLabel("Offer title").fill("Monthly sponsor access");
	const publish = page.getByRole("switch", { name: "Publish this sponsor offer" });
	await expect(publish).not.toHaveAttribute("aria-disabled", "true");
	await publish.click();
	await submitEditor(page.getByRole("dialog", { name: "Create sponsor offer" }));

	const saveError = page.getByRole("alert").filter({
		hasText:
			"Add a Tribute payment link for this subscription in Payment links before making it visible on Home",
	});
	await expectActionErrorRevealed(saveError);
	const accessibility = await new AxeBuilder({ page }).analyze();
	const serious = accessibility.violations.filter((violation) =>
		["serious", "critical"].includes(violation.impact ?? ""),
	);
	expect(serious).toEqual([]);
	if (testInfo.project.name === "mobile-chromium") {
		await page
			.getByRole("dialog", { name: "Create sponsor offer" })
			.screenshot({ path: testInfo.outputPath("sponsor-offer-action-error-dark.png") });
	}
	await expect(page.getByText(/Could not save this sponsor offer/)).toHaveCount(0);
	await expect(page.getByLabel("Offer title")).toHaveValue("Monthly sponsor access");
});

test("formatted offer copy keeps one fixed toolbar and renders safely on Home", async ({
	page,
	mockApi,
}, testInfo) => {
	testInfo.setTimeout(60_000);
	const offer = {
		...sponsorSubscriptionOffer(),
		description: "Support keeps the service available",
	};
	mockApi.seedSettings({
		tributeSubscriptionUrls: {
			"12": "https://t.me/tribute/app?startapp=subscription_12",
		},
	});
	mockApi.seedCommerceRules([sponsorSubscriptionRule()]);
	mockApi.seedSponsorOffers([offer]);

	await page.goto("/admin/settings/tribute/sponsor-offers");
	await page
		.getByRole("article", { name: offer.title })
		.getByRole("button", { name: "Edit" })
		.click();
	const editor = page.getByRole("dialog", { name: "Edit sponsor offer" });
	const description = editor.getByLabel("Description");
	const templates = editor.locator("details").filter({ hasText: "Templates" });
	await expect(templates).not.toHaveAttribute("open", "");
	await templates.getByText("Templates", { exact: true }).click();
	await expect(templates.getByRole("button", { name: "Copy {{appName}}" })).toBeVisible();
	await expect(description).toHaveCSS("font-size", "13px");
	await placeCaretAtEnd(description);
	await description.press("Enter");
	await description.pressSequentially("Faster support");
	await description.press("Enter");
	await description.pressSequentially("More traffic");
	const formattingToolbar = page.getByRole("toolbar", { name: "Text formatting" });
	await expect(formattingToolbar).toBeVisible();
	await expect(formattingToolbar).toHaveAttribute("aria-controls", "sponsor-offer-description");
	await editor.screenshot({ path: testInfo.outputPath("formatted-offer-fixed-toolbar.png") });
	await selectElementContents(description.locator("p").first());
	const boldTool = formattingToolbar.getByRole("button", { name: "Bold" });
	await boldTool.click();
	await expect(description.locator("strong")).toHaveText("Support keeps the service available");

	await selectElementContents(description.locator("strong"));
	await boldTool.focus();
	await boldTool.press("ArrowRight");
	await expect(formattingToolbar.getByRole("button", { name: "Italic" })).toBeFocused();
	await selectElementContents(description);
	await formattingToolbar.getByRole("button", { name: "Bulleted list" }).click();
	await expect(description.getByRole("list")).toContainText("Faster support");

	await selectElementContents(description.locator("strong"));
	await formattingToolbar.getByRole("button", { name: "Add or edit link" }).click();
	const linkAddress = page.getByRole("textbox", { name: "Link address" });
	await expect(linkAddress).toHaveCSS("font-size", "13px");
	await linkAddress.fill("example.com/composing");
	await linkAddress.evaluate((element) =>
		element.dispatchEvent(
			new KeyboardEvent("keydown", {
				key: "Enter",
				isComposing: true,
				bubbles: true,
				cancelable: true,
			}),
		),
	);
	await expect(linkAddress).toBeFocused();
	await expect(description.getByRole("link")).toHaveCount(0);
	await linkAddress.fill("javascript:alert(1)");
	await page.getByRole("button", { name: "Apply link" }).click();
	await expect(page.getByRole("alert")).toHaveText("Enter a valid http or https address");
	await linkAddress.fill("example.com/sponsor");
	await linkAddress.press("Enter");
	await expect(
		description.getByRole("link", { name: "Support keeps the service available" }),
	).toHaveAttribute("href", "https://example.com/sponsor");
	await expect(description).toBeFocused();

	const accessibilityByTheme: Array<{ theme: "light" | "dark"; serious: unknown[] }> = [];
	for (const colorScheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		await expect(page.getByRole("main").locator(":scope > div")).toHaveCSS("opacity", "1");
		const accessibility = await new AxeBuilder({ page }).analyze();
		const serious = accessibility.violations.filter((violation) =>
			["serious", "critical"].includes(violation.impact ?? ""),
		);
		accessibilityByTheme.push({ theme: colorScheme, serious });
		await assertNoHorizontalOverflow(page);
		await editor.screenshot({
			path: testInfo.outputPath(`formatted-offer-editor-${colorScheme}.png`),
		});
	}
	expect(accessibilityByTheme.filter(({ serious }) => serious.length > 0)).toEqual([]);
	await page.evaluate(() => {
		if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
	});
	await expect(editor.getByRole("button", { name: "Save offer" })).toHaveCount(0);

	const saveRequest = page.waitForRequest(
		(request) =>
			request.method() === "PUT" &&
			new URL(request.url()).pathname === `/api/debug/admin/commerce/offers/${offer.id}`,
	);
	await submitEditor(editor);
	const request = await saveRequest;
	const savedDescription = String(request.postDataJSON().description);
	expect(savedDescription).toContain("[**Support keeps the service available**]");
	expect(savedDescription).toContain("https://example.com/sponsor");
	expect(savedDescription).toContain("- Faster support");

	const formattedOffer = { ...offer, description: savedDescription };
	mockApi.seedSponsorState({
		status: "base_access",
		accessLevel: "base",
		primaryAction: "choose_offer",
		paidExpiresAt: null,
		baseExpiresAt: "2099-12-31T23:59:59Z",
		currentOfferId: null,
		managementUrl: null,
		pendingCheckout: null,
		offers: [formattedOffer],
	});
	await page.goto("/");
	const homeOffer = page.getByRole("article", { name: offer.title });
	await expect(homeOffer.locator("strong").filter({ hasText: "Support keeps" })).toBeVisible();
	await expect(
		homeOffer.getByRole("link", { name: "Support keeps the service available" }),
	).toHaveAttribute("href", "https://example.com/sponsor");
	await expect(homeOffer.getByRole("list").filter({ hasText: "More traffic" })).toBeVisible();
	await assertNoHorizontalOverflow(page);
	await page.screenshot({ path: testInfo.outputPath("formatted-offer-home-dark.png") });
});

test("admin can relink an existing sponsor offer to another automation rule", async ({
	page,
	mockApi,
}, testInfo) => {
	const currentRule = sponsorSubscriptionRule();
	const nextRule = {
		...currentRule,
		id: "10000000-0000-4000-8000-000000000099",
		name: "Believer benefits",
		accessProfileId: "00000000-0000-4000-8000-000000000002",
	};
	const offer = sponsorSubscriptionOffer();
	mockApi.seedSettings({
		tributeSubscriptionUrls: {
			"12": "https://t.me/tribute/app?startapp=subscription_12",
		},
	});
	mockApi.seedCommerceRules([currentRule, nextRule]);
	mockApi.seedSponsorOffers([offer]);
	const accessibilityByTheme: Array<{ theme: "light" | "dark"; serious: unknown[] }> = [];

	for (const colorScheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
		await page.goto("/admin/settings/tribute/sponsor-offers");
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		await page
			.getByRole("article", { name: offer.title })
			.getByRole("button", { name: "Edit" })
			.click();
		const themedEditor = page.getByRole("dialog", { name: "Edit sponsor offer" });
		const ruleSelect = themedEditor.getByLabel("Automation rule");
		await expect(ruleSelect).toBeEnabled();
		await ruleSelect.selectOption(nextRule.id);
		await expect(ruleSelect).toHaveValue(nextRule.id);
		await expect(
			themedEditor.getByText("A payment already started keeps the rule captured when it began", {
				exact: false,
			}),
		).toBeVisible();
		const accessibility = await new AxeBuilder({ page }).analyze();
		const serious = accessibility.violations.filter((violation) =>
			["serious", "critical"].includes(violation.impact ?? ""),
		);
		accessibilityByTheme.push({ theme: colorScheme, serious });
		await themedEditor.screenshot({
			path: testInfo.outputPath(`offer-rule-relink-${colorScheme}.png`),
		});
	}
	expect(accessibilityByTheme.filter(({ serious }) => serious.length > 0)).toEqual([]);

	const editor = page.getByRole("dialog", { name: "Edit sponsor offer" });
	const requestPromise = page.waitForRequest(
		(request) =>
			request.method() === "PUT" &&
			new URL(request.url()).pathname === `/api/debug/admin/commerce/offers/${offer.id}`,
	);
	await submitEditor(editor);
	const request = await requestPromise;
	expect(request.postDataJSON()).toMatchObject({ commerceRuleId: nextRule.id });
	await expect(page.getByRole("dialog", { name: "Edit sponsor offer" })).toHaveCount(0);
	await expect(
		page
			.getByRole("article", { name: offer.title })
			.getByText("Access: Believer benefits", { exact: true }),
	).toBeVisible();
	await assertNoHorizontalOverflow(page);
});

test("admin hides a published sponsor offer from its list toggle", async ({ page, mockApi }) => {
	mockApi.seedCommerceRules([sponsorSubscriptionRule()]);
	mockApi.seedSponsorOffers([sponsorSubscriptionOffer()]);

	await page.goto("/admin/settings/tribute/sponsor-offers");
	const visibility = page.getByRole("switch", {
		name: "Publish or hide Monthly sponsor access",
	});
	await expect(visibility).toBeChecked();
	const requestPromise = page.waitForRequest(
		(request) =>
			request.method() === "PUT" &&
			new URL(request.url()).pathname ===
				"/api/debug/admin/commerce/offers/30000000-0000-4000-8000-000000000001",
	);

	await visibility.click();
	const request = await requestPromise;

	expect(request.postDataJSON()).toMatchObject({ isPublished: false });
	await expect(visibility).not.toBeChecked();
	await expect(page.getByRole("alert")).toHaveCount(0);
});

test("admin groups legacy subscription cards around one readable plan preview", async ({
	page,
	mockApi,
}, testInfo) => {
	const sharedOffer = {
		...sponsorMultiPeriodOffer(),
		isPublished: false,
		availability: "draft",
	};
	mockApi.seedCommerceRules([sponsorSubscriptionRule()]);
	mockApi.seedSettings({
		tributeSubscriptionUrls: {
			"12": "https://t.me/tribute/app?startapp=subscription_12",
		},
	});
	mockApi.seedSponsorOffers([
		{ ...sharedOffer, title: "One month", id: "30000000-0000-4000-8000-000000000001" },
		{ ...sharedOffer, title: "Three months", id: "30000000-0000-4000-8000-000000000002" },
		{ ...sharedOffer, title: "One year", id: "30000000-0000-4000-8000-000000000003" },
	]);

	await page.goto("/admin/settings/tribute/sponsor-offers");
	const offersSection = page
		.getByRole("heading", { name: "Sponsor offers" })
		.locator("xpath=ancestor::section[1]");
	await expect(offersSection.getByText(/Some saved cards reuse/)).toBeVisible();
	await expect(offersSection.getByText("Billed monthly", { exact: true })).toHaveCount(1);
	await expect(offersSection.getByText("Billed every 3 months", { exact: true })).toHaveCount(1);
	await expect(offersSection.getByText("Billed yearly", { exact: true })).toHaveCount(1);
	await expect(offersSection.locator("details:not([open])")).toHaveCount(2);
	await expect(offersSection.getByRole("button", { name: "Edit" })).toHaveCount(1);

	const accessibilityByTheme: Array<{ theme: "light" | "dark"; serious: unknown[] }> = [];
	for (const colorScheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
		const warningSurface = colorScheme === "light" ? "rgb(255, 239, 204)" : "rgb(52, 45, 25)";
		const warningBorder = colorScheme === "light" ? "rgb(252, 218, 146)" : "rgb(99, 82, 29)";
		const warningText = colorScheme === "light" ? "rgb(138, 91, 0)" : "rgb(255, 203, 47)";
		const secondarySurface = colorScheme === "light" ? "rgb(242, 242, 242)" : "rgb(41, 41, 41)";
		const firstLegacyOffer = offersSection.locator('[data-ui="legacy-sponsor-offer"]').first();
		const duplicateNote = offersSection.getByRole("note");
		const duplicateWarning = offersSection.locator('[data-ui="duplicate-sponsor-warning"]').first();
		await firstLegacyOffer.locator("summary").click();
		await expect(offersSection.locator('[data-ui="duplicate-notice"]')).toHaveCSS(
			"background-color",
			"rgba(0, 0, 0, 0)",
		);
		await expect(duplicateNote).toHaveCSS("background-color", warningSurface);
		await expect(duplicateNote).toHaveCSS("border-color", warningBorder);
		await expect(duplicateNote).toHaveCSS("color", warningText);
		await expect(offersSection.locator('[data-ui="sponsor-offer-list"]')).toHaveCSS(
			"background-color",
			"rgba(0, 0, 0, 0)",
		);
		await expect(firstLegacyOffer).toHaveCSS("background-color", secondarySurface);
		await expect(duplicateWarning).toHaveCSS("background-color", warningSurface);
		await expect(duplicateWarning).toHaveCSS("border-color", warningBorder);
		await expect(duplicateWarning).toHaveCSS("color", warningText);
		await offersSection.screenshot({
			path: testInfo.outputPath(`admin-subscription-cards-${colorScheme}.png`),
		});
		const result = await new AxeBuilder({ page }).analyze();
		const serious = result.violations.filter((violation) =>
			["serious", "critical"].includes(violation.impact ?? ""),
		);
		accessibilityByTheme.push({ theme: colorScheme, serious });
		await assertNoHorizontalOverflow(page);
		await firstLegacyOffer.locator("summary").click();
	}
	expect(accessibilityByTheme.filter(({ serious }) => serious.length > 0)).toEqual([]);

	await offersSection.locator("details", { hasText: "Three months" }).locator("summary").click();
	await offersSection.locator("details", { hasText: "One year" }).locator("summary").click();
	await expect(offersSection.locator("details[open]")).toHaveCount(2);
	await expect(offersSection.getByRole("button", { name: "Edit" })).toHaveCount(3);
	const publishedToggle = offersSection.getByRole("switch", {
		name: "Publish or hide Three months",
	});
	await expect(publishedToggle).toBeEnabled();
	await publishedToggle.click();
	await expect(publishedToggle).toBeChecked();
	const oneMonthDetails = offersSection.locator("details", { hasText: "One month" });
	await oneMonthDetails.locator("summary").click();
	await expect(
		offersSection.getByRole("switch", { name: "Publish or hide One month" }),
	).toBeDisabled();
	const oneYearDetails = offersSection.locator("details", { hasText: "One year" });
	if (!(await oneYearDetails.evaluate((element) => (element as HTMLDetailsElement).open))) {
		await oneYearDetails.locator("summary").click();
	}
	await expect(
		offersSection.getByRole("switch", { name: "Publish or hide One year" }),
	).toBeDisabled();
	await expect(
		offersSection
			.getByRole("article", { name: "Three months" })
			.getByText("Billed monthly", { exact: true }),
	).toBeVisible();
	expect(mockApi.calls).toContain(
		"PUT /api/debug/admin/commerce/offers/30000000-0000-4000-8000-000000000002",
	);
});

test("admin publishes exact one-time and recurring donation choices from one rule", async ({
	page,
	mockApi,
}) => {
	mockApi.seedCommerceRules([sponsorDonationRule()]);

	await page.goto("/admin/settings/tribute/sponsor-offers");
	for (const [title, link, amount, mode, period] of [
		["One month sponsor", "https://t.me/tribute/app?startapp=month", "500", "one_time", null],
		["One year sponsor", "https://t.me/tribute/app?startapp=year", "3500", "recurring", "yearly"],
	] as const) {
		await page
			.getByRole("button", {
				name: title === "One month sponsor" ? "Create first offer" : "Add offer",
			})
			.click();
		await page.getByLabel("Offer title").fill(title);
		const donationLink = page.getByLabel("Tribute link for this offer");
		if (title === "One month sponsor") {
			await donationLink.fill("http://t.me/tribute/app?startapp=month");
			await expect(page.getByRole("alert")).toContainText("Use an HTTPS link");
			await expect(page.getByRole("switch", { name: "Publish this sponsor offer" })).toBeDisabled();
		}
		await donationLink.fill(link);
		await page.getByLabel("Amount the user must enter (RUB)").fill(amount);
		if (mode === "recurring" && period) {
			await page.getByRole("radio", { name: "Auto-donation" }).click();
			const frequency = page.getByLabel("Auto-donation frequency");
			expect(await frequency.locator("option").allTextContents()).toEqual([
				"week",
				"month",
				"3 months",
				"6 months",
				"year",
			]);
			await frequency.selectOption(period);
		}
		const publish = page.getByRole("switch", { name: "Publish this sponsor offer" });
		await expect(publish).toBeEnabled();
		await publish.click();
		const requestPromise = page.waitForRequest(
			(request) =>
				request.method() === "POST" &&
				new URL(request.url()).pathname === "/api/debug/admin/commerce/offers",
		);
		await submitEditor(page.getByRole("dialog", { name: "Create sponsor offer" }));
		const request = await requestPromise;
		const input = request.postDataJSON() as Record<string, unknown>;
		expect(input.checkoutUrl).toBe(link);
		expect(input.expectedAmountMinor).toBe(Number(amount) * 100);
		expect(input.expectedPaymentMode).toBe(mode);
		expect(input.expectedProviderPeriod).toBe(period);
		expect(input.commerceRuleId).toBe(sponsorDonationRule().id);
		await expect(page.getByText(title, { exact: true })).toBeVisible();
	}

	const offersSection = page
		.getByRole("heading", { name: "Sponsor offers" })
		.locator("xpath=ancestor::section[1]");
	await expect(
		offersSection.getByText("Access: Flexible sponsor donations", { exact: true }),
	).toHaveCount(2);
	await assertNoHorizontalOverflow(page);
});

test("Home starts a subscription checkout without treating the redirect as payment proof", async ({
	page,
	mockApi,
}) => {
	const offer = sponsorSubscriptionOffer("https://checkout.example.test/tribute/monthly");
	mockApi.seedSponsorOffers([offer]);
	mockApi.seedSponsorState({
		status: "no_access",
		accessLevel: "none",
		primaryAction: "choose_offer",
		paidExpiresAt: null,
		baseExpiresAt: null,
		currentOfferId: null,
		managementUrl: null,
		pendingCheckout: null,
		offers: [offer],
	});
	await page.route("https://checkout.example.test/**", (route) =>
		route.fulfill({ status: 200, contentType: "text/html", body: "Tribute checkout" }),
	);
	mockApi.mock("GET", "/api/me/subscription", {
		status: 404,
		body: { detail: "No subscription" },
	});

	await page.goto("/");
	await expect(page.getByRole("article", { name: "No active subscription" })).toBeVisible();
	await expect(page.getByRole("heading", { name: "Get extended access" })).toBeVisible();
	const subscriptionOffer = page.getByRole("article", { name: "Monthly sponsor access" });
	await expect(subscriptionOffer).toBeVisible();
	await expect(subscriptionOffer.getByText("Billed monthly", { exact: true })).toBeVisible();
	await expect(subscriptionOffer).toContainText("500");
	await expect(subscriptionOffer).toContainText(
		"Prices and billing intervals come from Tribute. Choose the payment option there",
	);
	const requestPromise = page.waitForRequest(
		(request) =>
			request.method() === "POST" &&
			new URL(request.url()).pathname === "/api/me/sponsor/checkouts",
	);
	await subscriptionOffer.getByRole("button", { name: "Continue in Tribute" }).click();
	const request = await requestPromise;
	expect(request.postDataJSON()).toEqual({ offerId: offer.id });
	expect(mockApi.calls).toContain("POST /api/me/sponsor/checkouts");
});

test("Home labels the eligible subscription as a welcome discount", async ({
	page,
	mockApi,
}, testInfo) => {
	const offer = {
		...sponsorSubscriptionOffer(),
		welcomeDiscount: true,
		welcomeDiscountPercent: 25,
		priceOptions: [
			{ priceMajor: "500", currency: "RUB", period: "monthly" },
			{ priceMajor: "5000", currency: "RUB", period: "annually" },
		],
	};
	mockApi.seedSponsorState({
		status: "no_access",
		accessLevel: "none",
		primaryAction: "choose_offer",
		paidExpiresAt: null,
		baseExpiresAt: null,
		currentOfferId: null,
		managementUrl: null,
		pendingCheckout: null,
		offers: [offer],
	});
	mockApi.mock("GET", "/api/me/subscription", {
		status: 404,
		body: { detail: "No subscription" },
	});
	const accessibilityByTheme: Array<{ theme: "light" | "dark"; serious: unknown[] }> = [];

	for (const colorScheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
		await page.goto("/");
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		const subscriptionOffer = page.getByRole("article", { name: "Monthly sponsor access" });
		await expect(page.getByRole("main").locator(":scope > div")).toHaveCSS("opacity", "1");
		const discount = subscriptionOffer.locator('[data-ui="welcome-discount"]');
		await expect(discount).toBeVisible();
		const expectedColors =
			colorScheme === "light"
				? {
						primary: "rgb(255, 255, 255)",
						primaryText: "rgb(23, 23, 23)",
						secondary: "rgb(242, 242, 242)",
						secondaryText: "rgb(69, 69, 69)",
						secondaryBorder: "rgb(199, 199, 199)",
						positive: "rgb(36, 120, 79)",
						positiveBorder: "rgb(198, 237, 217)",
					}
				: {
						primary: "rgb(33, 33, 33)",
						primaryText: "rgb(255, 255, 255)",
						secondary: "rgb(41, 41, 41)",
						secondaryText: "rgb(163, 163, 163)",
						secondaryBorder: "rgb(66, 66, 66)",
						positive: "rgb(73, 221, 147)",
						positiveBorder: "rgb(37, 96, 66)",
					};
		await expect(subscriptionOffer).toHaveCSS("background-color", expectedColors.primary);
		await expect(discount).toHaveCSS("background-color", expectedColors.secondary);
		await expect(discount).toHaveCSS("border-color", expectedColors.positiveBorder);
		await expect(discount.getByText("25% off your first payment")).toHaveCSS(
			"color",
			expectedColors.primaryText,
		);
		const discountIconWrapper = discount.locator('[data-ui="welcome-discount-icon"]');
		await expect(discountIconWrapper).toHaveCSS("color", expectedColors.positive);
		await expect(discountIconWrapper).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
		await expect(discountIconWrapper).toHaveCSS("border-style", "none");
		await expect(discountIconWrapper).toHaveCSS("box-shadow", "none");
		const discountIcon = discount.locator('[data-ui="welcome-discount-ticket-icon"]');
		await expect(discountIcon).toHaveClass(/lucide-ticket-percent/);
		await expect(discountIcon).toHaveAttribute("width", "20");
		await expect(discountIcon).toHaveAttribute("height", "20");
		const priceList = subscriptionOffer.getByRole("list", {
			name: "Payment options from Tribute",
		});
		await expect(priceList).toHaveCSS("background-color", expectedColors.secondary);
		await expect(priceList).toHaveCSS("border-color", expectedColors.secondaryBorder);
		await expect(priceList.locator("del").first()).toHaveCSS("color", expectedColors.secondaryText);
		await expect(subscriptionOffer.locator("del")).toHaveCount(2);
		const monthlyPrice = priceList.getByRole("listitem").nth(0);
		const yearlyPrice = priceList.getByRole("listitem").nth(1);
		await expect(monthlyPrice.locator("del")).toContainText("500");
		await expect(monthlyPrice.locator("strong")).toContainText("375");
		await expect(yearlyPrice.locator("del")).toContainText("5,000");
		await expect(yearlyPrice.locator("strong")).toContainText("3,750");
		await expect(
			subscriptionOffer.getByRole("button", { name: "Get 25% off in Tribute" }),
		).toBeVisible();
		await assertNoHorizontalOverflow(page);
		const accessibility = await new AxeBuilder({ page }).analyze();
		accessibilityByTheme.push({
			theme: colorScheme,
			serious: accessibility.violations.filter((violation) =>
				["serious", "critical"].includes(violation.impact ?? ""),
			),
		});
		await subscriptionOffer.screenshot({
			path: testInfo.outputPath(`welcome-discount-${colorScheme}.png`),
		});
	}
	expect(accessibilityByTheme.filter(({ serious }) => serious.length > 0)).toEqual([]);
});

test("Home reports confirmed subscription access without guessing cancellation state", async ({
	page,
	mockApi,
}, testInfo) => {
	const offer = sponsorSubscriptionOffer();
	const yearlyOffer = sponsorYearlySubscriptionOffer();
	const donationOffer = sponsorDonationOffer();
	mockApi.seedSettings({ appName: "Northstar Proxy" });
	mockApi.seedSponsorState({
		status: "recurring_active",
		accessLevel: "paid",
		primaryAction: "manage_subscription",
		paidExpiresAt: "2026-09-14T10:00:00Z",
		baseExpiresAt: null,
		currentOfferId: offer.id,
		managementUrl: "https://t.me/tribute",
		pendingCheckout: null,
		offers: [offer, yearlyOffer, donationOffer],
	});

	await page.goto("/");
	const activeCard = page.getByRole("region", { name: "Extended access is active" });
	await expect(activeCard).toBeVisible();
	await expect(
		activeCard.getByText(
			"Your paid access is available until the date below. Billing and cancellation are managed in Tribute",
		),
	).toBeVisible();
	await expect(
		activeCard.getByText(
			"If you cancel in Tribute, Northstar Proxy will update this card when the paid period ends and Tribute sends the change",
		),
	).toBeVisible();
	await expect(page.getByRole("button", { name: "Manage in Tribute" })).toBeVisible();
	await expect(page.getByText("Monthly sponsor access", { exact: true })).toHaveCount(0);
	await expect(page.getByRole("heading", { name: "Other subscription options" })).toBeVisible();
	await expect(
		page.getByText(
			"You can choose another subscription after your current paid period ends on Sep 14, 2026",
		),
	).toBeVisible();
	const yearlyOfferCard = page.getByRole("article", { name: "Yearly sponsor access" });
	const yearlyButton = yearlyOfferCard.getByRole("button", {
		name: "Available after current period",
	});
	await expect(yearlyButton).toBeDisabled();
	await expect(yearlyButton).toHaveAttribute("aria-describedby", "other-subscriptions-warning");
	await expect(yearlyOfferCard.getByText(/off your first payment/)).toHaveCount(0);
	await expect(yearlyOfferCard.locator('[data-ui="welcome-discount"]')).toHaveCount(0);
	await expect(yearlyOfferCard.locator("del")).toHaveCount(0);
	await expect(page.getByText("One month sponsor", { exact: true })).toHaveCount(0);
	await yearlyButton.evaluate((element) => (element as HTMLButtonElement).click());
	expect(mockApi.calls).not.toContain("POST /api/me/sponsor/checkouts");
	const accessibilityByTheme: Array<{ theme: "light" | "dark"; serious: unknown[] }> = [];
	for (const colorScheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		await expect(yearlyOfferCard).toHaveCSS(
			"border-color",
			colorScheme === "light" ? "rgb(230, 230, 230)" : "rgb(37, 37, 37)",
		);
		await expect(yearlyOfferCard).toHaveCSS(
			"background-color",
			colorScheme === "light" ? "rgb(242, 242, 242)" : "rgb(41, 41, 41)",
		);
		await expect(yearlyOfferCard).toHaveCSS("box-shadow", "none");
		await yearlyOfferCard.scrollIntoViewIfNeeded();
		await yearlyOfferCard.screenshot({
			path: testInfo.outputPath(`subscription-alternatives-${colorScheme}.png`),
		});
		const activeResult = await new AxeBuilder({ page }).analyze();
		const activeSerious = activeResult.violations.filter((violation) =>
			["serious", "critical"].includes(violation.impact ?? ""),
		);
		accessibilityByTheme.push({ theme: colorScheme, serious: activeSerious });
		await assertNoHorizontalOverflow(page);
	}
	expect(accessibilityByTheme.filter(({ serious }) => serious.length > 0)).toEqual([]);
	await yearlyButton.scrollIntoViewIfNeeded();
	await expect(yearlyButton).toBeInViewport();

	mockApi.seedSponsorState({
		status: "recurring_cancelled_active",
		accessLevel: "paid",
		primaryAction: "resume_recurring",
		paidExpiresAt: "2026-09-14T10:00:00Z",
		baseExpiresAt: null,
		currentOfferId: offer.id,
		managementUrl: null,
		pendingCheckout: null,
		offers: [offer],
	});
	await page.reload();
	await expect(page.getByRole("heading", { name: "Auto-renewal is off" })).toBeVisible();
	await expect(page.getByText("Sep 14, 2026", { exact: true })).toBeVisible();
	await expect(page.getByRole("button", { name: "Resume extended access" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Manage in Tribute" })).toHaveCount(0);
	await page.getByRole("button", { name: "Resume extended access" }).click();
	await expect(page.getByText("Monthly sponsor access", { exact: true })).toBeVisible();
	await assertNoHorizontalOverflow(page);
});

test("Home derives recurring billing UX from a recurring donation webhook lifecycle", async ({
	page,
	mockApi,
}) => {
	const offer = sponsorDonationOffer();
	mockApi.seedSettings({ appName: "Northstar Proxy" });
	mockApi.seedSponsorState({
		status: "recurring_donation_active",
		accessLevel: "paid",
		primaryAction: "manage_auto_donation",
		paidExpiresAt: "2026-09-14T10:00:00Z",
		baseExpiresAt: "2027-01-01T00:00:00Z",
		currentOfferId: offer.id,
		managementUrl: "https://t.me/tribute",
		pendingCheckout: null,
		offers: [offer],
	});

	await page.goto("/");
	await expect(page.getByRole("heading", { name: "Extended access is active" })).toBeVisible();
	await expect(page.getByText("Your paid access is available until the date below")).toBeVisible();
	await expect(
		page.getByText(
			"If you turn off auto-donation, Northstar Proxy will reflect the change when the paid period ends",
		),
	).toBeVisible();
	await expect(page.getByRole("button", { name: "Manage auto-donation in Tribute" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Extend access" })).toHaveCount(0);
	await expect(page.getByText("One month sponsor", { exact: true })).toHaveCount(0);
	const recurringHeartColor = await page
		.locator('[data-active="true"]')
		.evaluate((element) => getComputedStyle(element).color);
	const inactiveIconColor = await page
		.getByLabel("Registered through your invite")
		.evaluate((element) => getComputedStyle(element).color);
	expect(recurringHeartColor).not.toBe(inactiveIconColor);

	mockApi.seedSponsorState({
		status: "recurring_expired",
		accessLevel: "base",
		primaryAction: "resume_recurring",
		paidExpiresAt: null,
		baseExpiresAt: "2027-01-01T00:00:00Z",
		currentOfferId: offer.id,
		managementUrl: null,
		pendingCheckout: null,
		offers: [offer],
	});
	await page.reload();
	await expect(page.getByRole("heading", { name: "Recurring access ended" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Resume extended access" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Manage auto-donation in Tribute" })).toHaveCount(
		0,
	);
	await expect(page.getByRole("button", { name: "Extend access" })).toHaveCount(0);
	await page.getByRole("button", { name: "Resume extended access" }).click();
	await expect(page.getByText("One month sponsor", { exact: true })).toBeVisible();
	await assertNoHorizontalOverflow(page);
});

test("Home keeps base access while offering an upgrade and handles one-time renewal separately", async ({
	page,
	mockApi,
}) => {
	const offer = sponsorSubscriptionOffer();
	const donationOffer = sponsorDonationOffer();
	mockApi.seedSponsorState({
		status: "base_access",
		accessLevel: "base",
		primaryAction: "choose_offer",
		paidExpiresAt: null,
		baseExpiresAt: "2099-12-31T23:59:59Z",
		currentOfferId: null,
		managementUrl: null,
		pendingCheckout: null,
		offers: [offer, donationOffer],
	});

	await page.goto("/");
	await expect(page.getByText("Primary", { exact: true })).toBeVisible();
	await expect(page.getByRole("heading", { name: "Upgrade your access" })).toBeVisible();
	await expect(page.getByText("Basic access", { exact: true })).toBeVisible();
	await expect(page.getByText("No expiry", { exact: true })).toBeVisible();
	await expect(page.getByText("Jan 1, 2100", { exact: true })).toHaveCount(0);
	await expect(page.getByText("Monthly sponsor access", { exact: true })).toBeVisible();

	mockApi.seedSponsorState({
		status: "one_time_active",
		accessLevel: "paid",
		primaryAction: "renew",
		paidExpiresAt: "2026-09-14T10:00:00Z",
		baseExpiresAt: "2027-01-01T00:00:00Z",
		currentOfferId: offer.id,
		managementUrl: null,
		pendingCheckout: null,
		offers: [offer],
	});
	await page.reload();
	await expect(page.getByRole("heading", { name: "Extended access is active" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Extend access" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Manage in Tribute" })).toHaveCount(0);
	await expect(page.getByText("Monthly sponsor access", { exact: true })).toHaveCount(0);
	await page.getByRole("button", { name: "Extend access" }).click();
	await expect(page.getByText("Monthly sponsor access", { exact: true })).toBeVisible();
});

test("Home keeps offer choice available only while provider confirmation is pending", async ({
	page,
	mockApi,
}) => {
	const offer = sponsorSubscriptionOffer();
	const donationOffer = sponsorDonationOffer();
	mockApi.seedSponsorState({
		status: "checkout_pending",
		accessLevel: "base",
		primaryAction: "continue_checkout",
		paidExpiresAt: null,
		baseExpiresAt: "2027-01-01T00:00:00Z",
		currentOfferId: null,
		managementUrl: null,
		pendingCheckout: {
			id: "40000000-0000-4000-8000-000000000001",
			offerId: offer.id,
			status: "pending",
			checkoutUrl: offer.checkoutUrl,
			expiresAt: "2026-08-14T12:30:00Z",
		},
		offers: [offer, donationOffer],
	});

	await page.goto("/");
	const pendingCard = page.getByRole("region", { name: "Payment not confirmed yet" });
	await expect(pendingCard).toBeVisible();
	const checkPayment = pendingCard.getByRole("button", { name: "Check payment status" });
	const continuePayment = pendingCard.getByRole("button", { name: "Continue in Tribute" });
	const cancelPayment = pendingCard.getByRole("button", { name: "Cancel this attempt" });
	await expect(checkPayment).toBeVisible();
	await expect(continuePayment).toBeVisible();
	await expect(cancelPayment).toBeVisible();
	expect(
		(await pendingCard.getByRole("button").allTextContents())
			.slice(0, 3)
			.map((label) => label.trim()),
	).toEqual(["Check payment status", "Continue in Tribute", "Cancel this attempt"]);
	expect(
		await checkPayment.evaluate((element) => getComputedStyle(element).backgroundColor),
	).not.toBe("rgba(0, 0, 0, 0)");
	await expect(continuePayment).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
	await expect(cancelPayment).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
	const pendingActionsAccessibility = await new AxeBuilder({ page })
		.include('[data-ui="pending-checkout-actions"]')
		.analyze();
	expect(
		pendingActionsAccessibility.violations.filter((violation) =>
			["serious", "critical"].includes(violation.impact ?? ""),
		),
	).toEqual([]);
	await expect(page.getByRole("article", { name: "Monthly sponsor access" })).toHaveCount(0);
	const alternativeOffer = page.getByRole("article", { name: "One month sponsor" });
	await expect(alternativeOffer).toBeVisible();
	await expect(alternativeOffer.getByText("100 GB", { exact: true })).toBeVisible();
	await expect(alternativeOffer.getByText("5", { exact: true })).toBeVisible();

	mockApi.seedSponsorState({
		status: "provisioning",
		accessLevel: "base",
		primaryAction: "refresh",
		paidExpiresAt: null,
		baseExpiresAt: "2027-01-01T00:00:00Z",
		currentOfferId: null,
		managementUrl: null,
		pendingCheckout: null,
		offers: [offer],
	});
	await page.reload();
	await expect(page.getByRole("heading", { name: "Payment received" })).toBeVisible();
	await expect(page.getByText(/You do not need to pay again/)).toBeVisible();
	await expect(page.getByRole("button", { name: "Refresh status" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Continue in Tribute" })).toHaveCount(0);

	mockApi.seedSponsorState({
		status: "attention",
		accessLevel: "base",
		primaryAction: "refresh",
		paidExpiresAt: null,
		baseExpiresAt: "2027-01-01T00:00:00Z",
		currentOfferId: null,
		managementUrl: null,
		pendingCheckout: null,
		offers: [offer],
	});
	await page.reload();
	await expect(page.getByRole("heading", { name: "Payment needs review" })).toBeVisible();
	await expect(page.getByText(/Do not pay again/)).toBeVisible();
	await expect(page.getByText("Monthly sponsor access", { exact: true })).toHaveCount(0);
	await assertNoHorizontalOverflow(page);
});

test("failed sponsor refresh keeps stale access visible and reveals an action error", async ({
	page,
	mockApi,
}) => {
	const offer = sponsorSubscriptionOffer();
	const provisioningState = {
		status: "provisioning",
		accessLevel: "base",
		primaryAction: "refresh",
		paidExpiresAt: null,
		baseExpiresAt: "2027-01-01T00:00:00Z",
		currentOfferId: null,
		managementUrl: null,
		pendingCheckout: null,
		offers: [offer],
	};
	mockApi.mock("GET", "/api/me/sponsor", [
		{ body: provisioningState },
		{ status: 503, body: { detail: "Unavailable" } },
		{ status: 503, body: { detail: "Unavailable" } },
	]);

	await page.goto("/");
	await expect(page.getByRole("heading", { name: "Payment received" })).toBeVisible();
	await page.getByRole("button", { name: "Refresh status" }).click();
	const error = page.getByRole("alert").filter({
		hasText: "Could not refresh extended access status. Your existing access is unchanged",
	});
	await expectActionErrorRevealed(error);
	await expect(page.getByRole("heading", { name: "Payment received" })).toBeVisible();
	await expect(
		page.getByRole("heading", { name: "Extended access status unavailable" }),
	).toHaveCount(0);
	await assertNoHorizontalOverflow(page);
});

test("pending checkout checks quietly and switches directly to another offer", async ({
	page,
	mockApi,
}) => {
	const offer = sponsorSubscriptionOffer();
	const donationOffer = sponsorDonationOffer();
	const pendingState = {
		status: "checkout_pending",
		accessLevel: "base",
		primaryAction: "continue_checkout",
		paidExpiresAt: null,
		baseExpiresAt: "2027-01-01T00:00:00Z",
		currentOfferId: null,
		managementUrl: null,
		pendingCheckout: {
			id: "40000000-0000-4000-8000-000000000001",
			offerId: offer.id,
			status: "pending",
			checkoutUrl: offer.checkoutUrl,
			expiresAt: "2026-08-14T12:30:00Z",
		},
		offers: [offer, donationOffer],
	};
	mockApi.seedSponsorState(pendingState);
	mockApi.seedSponsorOffers([offer, donationOffer]);

	await page.goto("/");
	await expect(page.getByRole("heading", { name: "Payment not confirmed yet" })).toBeVisible();
	mockApi.mock("GET", "/api/me/sponsor", [
		{ delayMs: 350, body: pendingState },
		{ body: pendingState },
	]);

	const checkStatus = page.getByRole("button", { name: "Check payment status" });
	await checkStatus.click();
	await expect(checkStatus).toHaveAttribute("aria-busy", "true");
	await expect(checkStatus).toBeDisabled();
	await expect(page.getByRole("status")).toHaveCount(0);

	const donationCard = page.getByRole("article", { name: "One month sponsor" });
	const requestPromise = page.waitForRequest(
		(request) =>
			request.method() === "POST" &&
			new URL(request.url()).pathname === "/api/me/sponsor/checkouts",
	);
	await donationCard.getByRole("button", { name: "Support in Tribute" }).click();
	await requestPromise;
	expect(mockApi.calls).toContain("POST /api/me/sponsor/checkouts");
});

test("pending checkout can stop local waiting without losing the available offers", async ({
	page,
	mockApi,
}) => {
	const offer = sponsorSubscriptionOffer();
	const donationOffer = sponsorDonationOffer();
	const checkoutId = "40000000-0000-4000-8000-000000000001";
	mockApi.seedSponsorState({
		status: "checkout_pending",
		accessLevel: "base",
		primaryAction: "continue_checkout",
		paidExpiresAt: null,
		baseExpiresAt: "2027-01-01T00:00:00Z",
		currentOfferId: null,
		managementUrl: null,
		pendingCheckout: {
			id: checkoutId,
			offerId: offer.id,
			status: "pending",
			checkoutUrl: offer.checkoutUrl,
			expiresAt: "2026-08-14T12:30:00Z",
		},
		offers: [offer, donationOffer],
	});

	await page.goto("/");
	const deleteRequest = page.waitForRequest(
		(request) =>
			request.method() === "DELETE" &&
			new URL(request.url()).pathname.endsWith(`/checkouts/${checkoutId}`),
	);
	await page.getByRole("button", { name: "Cancel this attempt" }).click();
	await deleteRequest;
	await expect(page.getByRole("heading", { name: "Payment not confirmed yet" })).toHaveCount(0);
	await expect(page.getByRole("status")).toHaveCount(0);
	await expect(page.getByRole("article", { name: "Monthly sponsor access" })).toBeVisible();
	await expect(page.getByRole("article", { name: "One month sponsor" })).toBeVisible();
	await assertNoHorizontalOverflow(page);
});

test("failed pending cancellation keeps all recovery actions available", async ({
	page,
	mockApi,
}) => {
	const offer = sponsorSubscriptionOffer();
	const donationOffer = sponsorDonationOffer();
	mockApi.seedSponsorState({
		status: "checkout_pending",
		accessLevel: "base",
		primaryAction: "continue_checkout",
		paidExpiresAt: null,
		baseExpiresAt: "2027-01-01T00:00:00Z",
		currentOfferId: null,
		managementUrl: null,
		pendingCheckout: {
			id: "40000000-0000-4000-8000-000000000001",
			offerId: offer.id,
			status: "pending",
			checkoutUrl: offer.checkoutUrl,
			expiresAt: "2026-08-14T12:30:00Z",
		},
		offers: [offer, donationOffer],
	});
	mockApi.mock("DELETE", /^\/api\/(?:me\/sponsor|debug\/sponsor\/\d+)\/checkouts\/[^/]+$/, {
		status: 503,
		body: { detail: "Unavailable" },
	});

	await page.goto("/");
	await page.getByRole("button", { name: "Cancel this attempt" }).click();
	await expect(page.getByRole("alert")).toContainText(
		"Could not close this payment attempt. It is still waiting for confirmation",
	);
	await expect(page.getByRole("button", { name: "Check payment status" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Continue in Tribute" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Cancel this attempt" })).toBeVisible();
});

test("failed alternative checkout keeps the existing pending intent visible", async ({
	page,
	mockApi,
}) => {
	const offer = sponsorSubscriptionOffer();
	const donationOffer = sponsorDonationOffer();
	mockApi.seedSponsorState({
		status: "checkout_pending",
		accessLevel: "base",
		primaryAction: "continue_checkout",
		paidExpiresAt: null,
		baseExpiresAt: "2027-01-01T00:00:00Z",
		currentOfferId: null,
		managementUrl: null,
		pendingCheckout: {
			id: "40000000-0000-4000-8000-000000000001",
			offerId: offer.id,
			status: "pending",
			checkoutUrl: offer.checkoutUrl,
			expiresAt: "2026-08-14T12:30:00Z",
		},
		offers: [offer, donationOffer],
	});
	mockApi.mock("POST", "/api/me/sponsor/checkouts", {
		status: 503,
		body: { detail: "Unavailable" },
	});

	await page.goto("/");
	await page
		.getByRole("article", { name: "One month sponsor" })
		.getByRole("button", { name: "Support in Tribute" })
		.click();
	await expect(page.getByRole("heading", { name: "Payment not confirmed yet" })).toBeVisible();
	await expect(page.getByRole("alert")).toContainText(
		"Could not start this payment. No payment was created",
	);
	await expect(page.getByRole("button", { name: "Continue in Tribute" })).toHaveCount(1);
});

test("returning to a completed donation refreshes access and removes pending guidance", async ({
	page,
	mockApi,
}) => {
	const subscriptionOffer = sponsorSubscriptionOffer();
	const donationOffer = sponsorDonationOffer();
	mockApi.seedSponsorState({
		status: "checkout_pending",
		accessLevel: "base",
		primaryAction: "continue_checkout",
		paidExpiresAt: null,
		baseExpiresAt: "2027-01-01T00:00:00Z",
		currentOfferId: null,
		managementUrl: null,
		pendingCheckout: {
			id: "40000000-0000-4000-8000-000000000001",
			offerId: donationOffer.id,
			status: "pending",
			checkoutUrl: donationOffer.checkoutUrl,
			expiresAt: "2026-08-14T12:30:00Z",
		},
		offers: [donationOffer, subscriptionOffer],
	});

	await page.goto("/");
	const pendingCard = page.getByRole("region", { name: "Payment not confirmed yet" });
	const pendingHeartColor = await pendingCard
		.locator('[data-status="checkout_pending"]')
		.evaluate((element) => getComputedStyle(element).color);
	const inviteColor = await page
		.getByLabel("Registered through your invite")
		.evaluate((element) => getComputedStyle(element).color);
	expect(inviteColor).toBe(pendingHeartColor);

	mockApi.seedSponsorState({
		status: "one_time_active",
		accessLevel: "paid",
		primaryAction: "renew",
		paidExpiresAt: "2026-09-13T15:39:49Z",
		baseExpiresAt: "2027-01-01T00:00:00Z",
		currentOfferId: donationOffer.id,
		managementUrl: null,
		pendingCheckout: null,
		offers: [donationOffer, subscriptionOffer],
	});
	mockApi.mock("GET", "/api/me/subscription", {
		body: { ...mockData.subscription, expiresAt: 1_789_315_189 },
	});

	await page.evaluate(() => window.dispatchEvent(new Event("focus")));
	const activeCard = page.getByRole("region", { name: "Extended access is active" });
	await expect(activeCard).toBeVisible();
	await expect(page.getByRole("button", { name: "Continue in Tribute" })).toHaveCount(0);
	await expect(page.getByRole("button", { name: "Check payment status" })).toHaveCount(0);
	await expect(page.getByRole("button", { name: "Extend access" })).toBeVisible();
	const activeHeartColor = await activeCard
		.locator('[data-status="one_time_active"]')
		.evaluate((element) => getComputedStyle(element).color);
	expect(activeHeartColor).not.toBe(pendingHeartColor);
	expect(
		mockApi.calls.filter((call) => call === "GET /api/me/subscription").length,
	).toBeGreaterThanOrEqual(2);

	await page.getByRole("button", { name: "Extend access" }).click();
	await expect(page.getByText("One month sponsor", { exact: true })).toBeVisible();
	await expect(page.getByText("Monthly sponsor access", { exact: true })).toBeVisible();
	await expect(activeCard.getByText("Donation", { exact: true })).toHaveCount(0);
	await expect(activeCard.getByText("Subscription", { exact: true })).toHaveCount(0);
	await assertNoHorizontalOverflow(page);
});

test("sponsor checkout card produces reviewable light and dark evidence", async ({
	page,
	mockApi,
}, testInfo) => {
	const offer = sponsorMultiPeriodOffer();
	const donationOffer = sponsorDonationOffer();
	const accessibilityByTheme: Array<{ theme: "light" | "dark"; serious: unknown[] }> = [];

	for (const colorScheme of ["light", "dark"] as const) {
		mockApi.seedSponsorState({
			status: "base_access",
			accessLevel: "base",
			primaryAction: "choose_offer",
			paidExpiresAt: null,
			baseExpiresAt: "2099-12-31T23:59:59Z",
			currentOfferId: null,
			managementUrl: null,
			pendingCheckout: null,
			offers: [offer],
		});
		await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
		await page.goto("/");
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		const card = page.getByRole("region", { name: "Upgrade your access" });
		await expect(card).toBeVisible();
		await expect(card.getByText("Basic access", { exact: true })).toBeVisible();
		await expect(card.getByText("No expiry", { exact: true })).toBeVisible();
		const neutralBorder = colorScheme === "light" ? "rgb(199, 199, 199)" : "rgb(66, 66, 66)";
		const accessFact = card.locator('[data-ui="sponsor-access-fact"]');
		await expect(accessFact).toHaveCSS(
			"background-color",
			colorScheme === "light" ? "rgb(242, 242, 242)" : "rgb(41, 41, 41)",
		);
		await expect(accessFact).toHaveCSS("border-color", neutralBorder);
		await expect(accessFact).toHaveCSS("border-style", "solid");
		const availableOffer = card.getByRole("article", { name: "Sponsor access" });
		const accentBorder = colorScheme === "light" ? "rgb(198, 237, 217)" : "rgb(37, 96, 66)";
		const accentInset = colorScheme === "light" ? "rgb(36, 120, 79)" : "rgb(73, 221, 147)";
		await expect(availableOffer).toHaveCSS("border-color", accentBorder);
		await expect(availableOffer).toHaveCSS("box-shadow", `${accentInset} 3px 0px 0px 0px inset`);
		const paymentOptions = card.getByRole("list", { name: "Payment options from Tribute" });
		await expect(availableOffer.locator('[data-ui="welcome-discount"]')).toHaveCount(0);
		await expect(paymentOptions.locator("del")).toHaveCount(0);
		await expect(paymentOptions).toHaveCSS(
			"background-color",
			colorScheme === "light" ? "rgb(242, 242, 242)" : "rgb(41, 41, 41)",
		);
		await expect(paymentOptions).toHaveCSS("border-color", neutralBorder);
		await expect(paymentOptions.getByRole("listitem").nth(1)).toHaveCSS(
			"border-top-color",
			colorScheme === "light" ? "rgb(230, 230, 230)" : "rgb(37, 37, 37)",
		);
		await expect(paymentOptions.getByText("Billed monthly", { exact: true })).toBeVisible();
		await expect(paymentOptions.getByText("Billed every 3 months", { exact: true })).toBeVisible();
		await expect(paymentOptions.getByText("Billed yearly", { exact: true })).toBeVisible();
		const benefits = availableOffer.getByLabel("Included access");
		await expect(benefits.getByText("100 GB", { exact: true })).toBeVisible();
		await expect(benefits.getByText("5", { exact: true })).toBeVisible();
		await expect(
			card.getByText(
				"Prices and billing intervals come from Tribute. Choose the payment option there",
			),
		).toBeVisible();
		await availableOffer.scrollIntoViewIfNeeded();
		await availableOffer.screenshot({
			path: testInfo.outputPath(`sponsor-card-${colorScheme}.png`),
		});
		await card.screenshot({
			path: testInfo.outputPath(`sponsor-access-hierarchy-${colorScheme}.png`),
		});
		const result = await new AxeBuilder({ page }).analyze();
		const serious = result.violations.filter((violation) =>
			["serious", "critical"].includes(violation.impact ?? ""),
		);
		accessibilityByTheme.push({ theme: colorScheme, serious });
		await assertNoHorizontalOverflow(page);

		mockApi.seedSponsorState({
			status: "checkout_pending",
			accessLevel: "base",
			primaryAction: "continue_checkout",
			paidExpiresAt: null,
			baseExpiresAt: "2099-12-31T23:59:59Z",
			currentOfferId: null,
			managementUrl: null,
			pendingCheckout: {
				id: "40000000-0000-4000-8000-000000000001",
				offerId: offer.id,
				status: "pending",
				checkoutUrl: offer.checkoutUrl,
				expiresAt: "2026-08-14T12:30:00Z",
			},
			offers: [offer, donationOffer],
		});
		await page.reload();
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		const pendingCard = page.getByRole("region", { name: "Payment not confirmed yet" });
		await expect(pendingCard).toBeVisible();
		await expect(pendingCard.getByRole("article", { name: "Sponsor access" })).toHaveCount(0);
		await expect(
			pendingCard
				.getByRole("article", { name: "One month sponsor" })
				.getByRole("button", { name: "Support in Tribute" }),
		).toBeVisible();
		await pendingCard.screenshot({
			path: testInfo.outputPath(`sponsor-pending-${colorScheme}.png`),
		});
		await expect(page.getByRole("dialog")).toHaveCount(0);
		await assertNoHorizontalOverflow(page);

		mockApi.seedSponsorState({
			status: "one_time_active",
			accessLevel: "paid",
			primaryAction: "renew",
			paidExpiresAt: "2026-09-14T10:00:00Z",
			baseExpiresAt: "2027-01-01T00:00:00Z",
			currentOfferId: offer.id,
			managementUrl: null,
			pendingCheckout: null,
			offers: [offer],
		});
		await page.reload();
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		await expect(page.getByRole("region", { name: "Extended access is active" })).toBeVisible();
		await page.screenshot({
			path: testInfo.outputPath(`home-sponsor-active-${colorScheme}.png`),
			fullPage: true,
		});
		await expect(page.getByRole("button", { name: "Extend access" })).toBeVisible();
		await expect(page.getByLabel("Registered through your invite")).toBeVisible();
		await assertNoHorizontalOverflow(page);

		const recurringDonationOffer = sponsorDonationOffer(
			undefined,
			undefined,
			"recurring",
			"monthly",
		);
		mockApi.seedSponsorState({
			status: "recurring_donation_active",
			accessLevel: "paid",
			primaryAction: "manage_auto_donation",
			paidExpiresAt: "2026-09-14T10:00:00Z",
			baseExpiresAt: "2027-01-01T00:00:00Z",
			currentOfferId: recurringDonationOffer.id,
			managementUrl: "https://t.me/tribute",
			pendingCheckout: null,
			offers: [recurringDonationOffer],
		});
		await page.reload();
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		const recurringCard = page.getByRole("region", { name: "Extended access is active" });
		await expect(recurringCard).toBeVisible();
		await recurringCard.screenshot({
			path: testInfo.outputPath(`sponsor-recurring-donation-${colorScheme}.png`),
		});
		await expect(
			page.getByRole("button", { name: "Manage auto-donation in Tribute" }),
		).toBeVisible();
		await expect(page.getByRole("button", { name: "Extend access" })).toHaveCount(0);
		await assertNoHorizontalOverflow(page);
	}
	expect(accessibilityByTheme.filter(({ serious }) => serious.length > 0)).toEqual([]);
});

test("identified donation checkout clearly warns against anonymous attribution", async ({
	page,
	mockApi,
}, testInfo) => {
	const offer = sponsorDonationOffer(
		"https://t.me/tribute/app?startapp=donation",
		"Flexible sponsor donation",
	);
	const recurringOffer = {
		...sponsorDonationOffer(
			"https://t.me/tribute/app?startapp=donation-yearly",
			"Yearly sponsor donation",
			"recurring",
			"yearly",
		),
		id: "30000000-0000-4000-8000-000000000003",
		expectedAmountMinor: 350_000,
		priceOptions: [{ priceMajor: "3500", currency: "RUB", period: "yearly" }],
	};
	mockApi.seedSponsorState({
		status: "no_access",
		accessLevel: "none",
		primaryAction: "choose_offer",
		paidExpiresAt: null,
		baseExpiresAt: null,
		currentOfferId: null,
		managementUrl: null,
		pendingCheckout: null,
		offers: [offer, recurringOffer],
	});
	mockApi.mock("GET", "/api/me/subscription", {
		status: 404,
		body: { detail: "No subscription" },
	});

	for (const colorScheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
		await page.goto("/");
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		const card = page.getByRole("region", { name: "Get extended access" });
		await expect(card.getByText("Flexible sponsor donation", { exact: true })).toBeVisible();
		const donationPriceRows = card.locator('[data-ui="sponsor-donation-price"]');
		await expect(donationPriceRows).toHaveCount(2);
		for (const priceRow of await donationPriceRows.all()) {
			await expect(priceRow).toHaveCSS(
				"background-color",
				colorScheme === "light" ? "rgb(242, 242, 242)" : "rgb(41, 41, 41)",
			);
			await expect(priceRow).toHaveCSS(
				"border-color",
				colorScheme === "light" ? "rgb(199, 199, 199)" : "rgb(66, 66, 66)",
			);
		}
		await expect(
			card.getByText(/RUB.*500.*One-time donation.*same Telegram account/i),
		).toBeVisible();
		await expect(
			card.getByText(/RUB.*3,500.*Auto-donation every year.*same Telegram account/i),
		).toBeVisible();
		await expect(card.getByText(/Other settings need manual review/)).toHaveCount(2);
		await card.screenshot({
			path: testInfo.outputPath(`sponsor-donation-choices-${colorScheme}.png`),
		});
		await assertNoHorizontalOverflow(page);
	}
});

test("sponsor offer editor stays native to the design system in both themes", async ({
	page,
	mockApi,
}, testInfo) => {
	mockApi.seedCommerceRules([sponsorDonationRule()]);

	for (const colorScheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
		await page.goto("/admin/settings/tribute/sponsor-offers");
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		await page.getByRole("button", { name: "Create first offer" }).click();
		const dialog = page.getByRole("dialog", { name: "Create sponsor offer" });
		await expect(dialog).toBeVisible();
		await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toHaveCount(0);
		await dialog.getByRole("radio", { name: "Auto-donation" }).click();
		await expect(dialog.getByLabel("Auto-donation frequency")).toBeVisible();
		await dialog.screenshot({
			path: testInfo.outputPath(`sponsor-offer-editor-${colorScheme}.png`),
		});
		const result = await new AxeBuilder({ page }).analyze();
		const serious = result.violations.filter((violation) =>
			["serious", "critical"].includes(violation.impact ?? ""),
		);
		expect(serious).toEqual([]);
		await assertNoHorizontalOverflow(page);
		await page.getByRole("button", { name: "Close offer editor" }).click();
	}
});
