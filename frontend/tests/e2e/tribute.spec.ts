import AxeBuilder from "@axe-core/playwright";
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
import {
	expectActionErrorRevealed,
	sponsorDonationOffer,
	sponsorDonationRule,
	sponsorSubscriptionOffer,
	sponsorSubscriptionRule,
	submitEditor,
} from "./fixtures/tribute.ts";

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
		await page.evaluate(
			() =>
				new Promise<void>((resolve) => {
					requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
				}),
		);
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
