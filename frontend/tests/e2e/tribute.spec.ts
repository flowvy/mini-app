import AxeBuilder from "@axe-core/playwright";
import {
	assertNoHorizontalOverflow,
	entitlementOperation,
	expect,
	mockData,
	test,
} from "./fixtures/mock-api.ts";
import { installVisualViewportMock, setTestVisualViewport } from "./fixtures/visual-viewport.ts";

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
		availability: "ready",
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
	await expect(page.getByRole("heading", { name: "Access automation" })).toBeVisible();
	await expect(page.getByText("No automation rules", { exact: true })).toBeVisible();
	await expect(page.getByText("No events yet", { exact: true })).toBeVisible();

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
	await page.goto("/admin/settings/tribute");
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
	await page.goto("/admin/settings/tribute");
	await expect(page.getByText("Missing on server", { exact: true })).toBeVisible();
	await expect(page.getByText(/Set TRIBUTE_API_KEY/)).toBeVisible();
	await expect(page.getByRole("button", { name: "Check API" })).toBeDisabled();
	await expect(page.getByText("Authenticated", { exact: true })).toBeVisible();
	await expect(page.getByText("Planning only", { exact: true })).toBeVisible();
	await expect(page.getByText(/Subscriptions reconcile Tribute's exact expiration/)).toBeVisible();
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

	await page.goto("/admin/settings/tribute");
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
	await expect(page).toHaveURL(/\/admin\/settings\/tribute$/);
	await expect(subscription).toHaveValue("https://pay.example.test/subscription");

	await page.goBack();
	await dialog.getByRole("button", { name: "Discard", exact: true }).click();
	await expect(page).toHaveURL(/\/admin\/settings$/);
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

	await page.goto("/admin/settings/tribute");
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
	await page.goto("/admin/settings/tribute");

	await expect(page.getByText("Loading Tribute subscriptions…", { exact: true })).toBeVisible();
	await expect(page.getByText(/Tribute returned no subscriptions/)).toBeVisible();
	await assertNoHorizontalOverflow(page);
});

test("payment link save failure stays generic and keeps the draft", async ({ page, mockApi }) => {
	mockApi.mock("PATCH", "/api/debug/admin/settings", {
		status: 422,
		body: { detail: "private persistence diagnostic" },
	});
	await page.goto("/admin/settings/tribute");
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
	await page.goto("/admin/settings/tribute");
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

	await page.getByRole("button", { name: "Create rule" }).click();
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
	await page.goto("/admin/settings/tribute");
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
		await page.goto("/admin/settings/tribute");
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		await page.getByRole("button", { name: "Create first rule" }).click();
		await page.getByRole("radio", { name: "Subscription", exact: true }).click();
		await page.getByLabel("Tribute offer").selectOption("12");

		const editor = page.getByLabel("Create automation rule");
		const providerExpiry = editor.getByText("Tribute controls the expiration date", {
			exact: true,
		});
		await expect(providerExpiry).toBeVisible();
		await expect(editor.getByText(/applies the subscription's expires_at value/)).toBeVisible();
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
			await editor.getByRole("button", { name: "Create rule", exact: true }).click();
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

	await page.goto("/admin/settings/tribute");
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

	await page.goto("/admin/settings/tribute");
	await page.getByRole("button", { name: /Legacy subscription/ }).click();
	const offer = page.getByLabel("Tribute offer");
	await expect(offer).toHaveValue("999");
	await expect(offer.locator('option[value="999"]')).toHaveText("Current Tribute item · ID 999");
	await expect(page.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
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
	await page.goto("/admin/settings/tribute");

	await expect(page.getByRole("alert")).toContainText("Could not load payment activity");
	await expect(page.getByText("private activity diagnostic")).toHaveCount(0);
	await page.getByRole("button", { name: "Retry", exact: true }).click();
	await expect(page.getByText("Loading recent payment activity…", { exact: true })).toBeVisible();
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
	await page.goto("/admin/settings/tribute");

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

	await page.goto("/admin/settings/tribute");
	const resolveButton = page.getByRole("button", { name: "Resolve", exact: true });
	await resolveButton.click();
	const dialog = page.getByRole("dialog", { name: "Resolve without changing access?" });
	await expect(dialog).toBeVisible();
	await expect(
		dialog.getByRole("heading", { name: "Resolve without changing access?" }),
	).toBeFocused();
	await expect(dialog.getByRole("button", { name: "Close" })).not.toBeFocused();
	await expect(dialog.getByRole("button", { name: "Resolve", exact: true })).toBeDisabled();
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

	await page.goto("/admin/settings/tribute");
	await expect(page.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
	await expect(page.getByRole("button", { name: "Resolve", exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Retry", exact: true }).click();
	const dialog = page.getByRole("dialog", { name: "Queue another provider attempt?" });
	await expect(dialog).toContainText(
		"Automatic delivery is currently off. This attempt will stay queued",
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

test("resolution closes the native dialog before paint while the keyboard viewport restores", async ({
	page,
	mockApi,
}) => {
	await installVisualViewportMock(page);
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

	await page.goto("/admin/settings/tribute");
	const touchInput = await page.evaluate(
		() => window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0,
	);
	test.skip(!touchInput, "Software-keyboard viewport lifecycle applies only to touch clients");
	await page.getByRole("button", { name: "Resolve", exact: true }).click();
	const dialog = page.getByRole("dialog", { name: "Resolve without changing access?" });
	const note = page.getByLabel("Resolution note");
	await note.fill("Verified in Tribute");
	await note.focus();
	const restoredViewportHeight = await page.evaluate(() => window.innerHeight);
	const keyboardViewportHeight = Math.max(240, restoredViewportHeight - 300);
	await setTestVisualViewport(page, keyboardViewportHeight);
	const navigation = page.getByRole("navigation", { includeHidden: true });
	await expect(navigation).toHaveAttribute("aria-hidden", "true");

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
	await expect(dialog).toBeVisible();
	await expect(dialog.getByRole("button", { name: "Resolve", exact: true })).toHaveAttribute(
		"aria-busy",
		"true",
	);
	await expect(navigation).toHaveAttribute("aria-hidden", "true");

	await setTestVisualViewport(page, restoredViewportHeight);
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
	await expect(navigation).not.toHaveAttribute("aria-hidden", "true");
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
	await page.goto("/admin/settings/tribute");
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

	await page.getByLabel("Payment amount (RUB)").fill("600");
	await expect(page.getByText("Telegram session expired")).toHaveCount(0);
	await page.getByRole("button", { name: "Preview", exact: true }).click();
	await expect(page.getByText("5 access days", { exact: true })).toBeVisible();
	await assertNoHorizontalOverflow(page);
});

test("rule editor reveals focused inputs and keeps actions hidden through keyboard close", async ({
	page,
	mockApi: _mock,
}) => {
	await installVisualViewportMock(page);
	await page.goto("/admin/settings/tribute");
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
	const restoredViewportHeight = await page.evaluate(() => window.innerHeight);
	const keyboardViewportHeight = Math.max(240, restoredViewportHeight - 300);
	await setTestVisualViewport(page, keyboardViewportHeight);
	const touchInput = await page.evaluate(
		() => window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0,
	);
	const footer = dialog.locator("footer");
	if (touchInput) {
		await expect(footer).toHaveAttribute("aria-hidden", "true");
		await expect(footer).toBeHidden();
		await expect
			.poll(async () => {
				const box = await focusedInput.boundingBox();
				return box ? box.y + box.height : Number.POSITIVE_INFINITY;
			})
			.toBeLessThan(keyboardViewportHeight - 10);

		await focusedInput.blur();
		await expect(focusedInput).not.toBeFocused();
		await expect(footer).toBeHidden();
		await expect(page.getByRole("navigation", { includeHidden: true })).toHaveAttribute(
			"aria-hidden",
			"true",
		);
		await setTestVisualViewport(page, restoredViewportHeight);
	} else {
		await expect(footer).toBeVisible();
		await focusedInput.blur();
	}
	await expect(footer).toBeVisible();
	await assertNoHorizontalOverflow(page);
});

test("saved rule can be disabled, edited, and deleted with explicit confirmation", async ({
	page,
	mockApi,
}) => {
	mockApi.seedCommerceRules([
		{
			id: "10000000-0000-4000-8000-000000000001",
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
	await page.goto("/admin/settings/tribute");

	const toggle = page.getByRole("switch", { name: "Enable or disable Monthly donation access" });
	await toggle.click();
	await expect(toggle).toHaveAttribute("aria-checked", "false");

	await page.getByRole("button", { name: /Monthly donation access/ }).click();
	await page.getByLabel("Rule name").fill("Updated donation access");
	await page.getByLabel("Rule name").press("Enter");
	await page.getByRole("button", { name: "Save", exact: true }).click();
	await expect(page.getByText("Updated donation access", { exact: true })).toBeVisible();

	await page.getByRole("button", { name: /Updated donation access/ }).click();
	await page.getByRole("button", { name: "Delete", exact: true }).click();
	await expect(page.getByText(/will be removed from Flowvy configuration/)).toBeVisible();
	await page
		.getByRole("dialog", { name: "Delete automation rule?" })
		.getByRole("button", { name: "Delete", exact: true })
		.click();
	await expect(page.getByText("No automation rules", { exact: true })).toBeVisible();
});

test("rule editor exposes safe no-match and save-failure states", async ({ page, mockApi }) => {
	mockApi.mock("POST", "/api/debug/admin/commerce/rules", {
		status: 422,
		body: { detail: "private persistence diagnostic" },
		delayMs: 600,
	});
	await page.goto("/admin/settings/tribute");
	await page.getByRole("button", { name: "Create first rule" }).click();
	await page.getByLabel("Rule name").fill("Donation access");
	await page.getByLabel("Starts at").fill("500");
	await page.getByLabel("Payment unit").fill("500");
	await page.getByLabel("Access per unit").fill("30");
	await page.getByLabel("Payment amount (RUB)").fill("100");
	await page.getByRole("button", { name: "Preview", exact: true }).click();
	await expect(page.getByText("No matching amount band", { exact: true })).toBeVisible();

	const createButton = page.getByRole("button", { name: "Create rule" });
	await createButton.click();
	await expect(createButton).toHaveAttribute("aria-busy", "true");
	const loadingIndicator = createButton.locator('[data-loading-indicator=""]');
	await expect(loadingIndicator).toBeVisible();
	await expect(loadingIndicator.locator("svg")).toHaveCount(0);
	await expect(loadingIndicator).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
	await expect(page.getByRole("alert")).toContainText("Could not save the automation rule");
	await expect(page.getByText("private persistence diagnostic")).toHaveCount(0);
});

test("commerce rules expose loading, load-error, and unavailable-profile states", async ({
	page,
	mockApi,
}) => {
	mockApi.mock("GET", "/api/debug/admin/commerce/rules", {
		delayMs: 600,
		body: [],
	});
	await page.goto("/admin/settings/tribute");
	await expect(page.getByText("Loading automation rules…", { exact: true })).toBeVisible();
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
	await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
});

test("Tribute settings pass serious accessibility and overflow checks", async ({
	page,
	mockApi: _mock,
}) => {
	for (const colorScheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
		await page.goto("/admin/settings/tribute");
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
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
		await page.goto("/admin/settings/tribute");
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
			await page.goto("/admin/settings/tribute");
			await page.evaluate((theme) => {
				document.documentElement.setAttribute("data-theme", theme);
			}, colorScheme);
			await page.getByRole("button", { name: "Create first rule" }).click();
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

test("admin creates a user-facing sponsor offer from an automation rule", async ({
	page,
	mockApi,
}) => {
	mockApi.seedCommerceRules([sponsorSubscriptionRule()]);

	await page.goto("/admin/settings/tribute");
	await expect(page.getByRole("heading", { name: "Sponsor offers" })).toBeVisible();
	await page.getByRole("button", { name: "Create first offer" }).click();
	await expect(page.getByRole("heading", { name: "Create sponsor offer" })).toBeVisible();
	await page.getByLabel("Offer title").fill("Monthly sponsor access");
	await expect(page.getByLabel("Description")).toHaveAttribute(
		"placeholder",
		"Help us keep the service running and receive sponsor access",
	);
	await page.getByLabel("Description").fill("Automatic monthly support with extended access.");
	await expect(page.getByRole("switch", { name: "Publish this sponsor offer" })).toBeDisabled();
	await expect(page.getByText(/This offer can stay as a draft/)).toBeVisible();
	await page.getByRole("heading", { name: "Payment and access" }).click();
	await page.getByRole("button", { name: "Create offer" }).click();

	await expect(page.getByRole("heading", { name: "Create sponsor offer" })).toHaveCount(0);
	await expect(page.getByText("Monthly sponsor access", { exact: true })).toBeVisible();
	await expect(page.getByText("Price checked when published", { exact: true })).toBeVisible();
	expect(mockApi.calls).toContain("POST /api/debug/admin/commerce/offers");
	await assertNoHorizontalOverflow(page);
});

test("admin hides a published sponsor offer from its list toggle", async ({ page, mockApi }) => {
	mockApi.seedSettings({ tributeEntitlementExecutionEnabled: true });
	mockApi.seedCommerceRules([sponsorSubscriptionRule()]);
	mockApi.seedSponsorOffers([sponsorSubscriptionOffer()]);

	await page.goto("/admin/settings/tribute");
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
	await expect(page.getByText("Draft", { exact: true })).toBeVisible();
	await expect(page.getByRole("alert")).toHaveCount(0);
});

test("admin publishes exact one-time and recurring donation choices from one rule", async ({
	page,
	mockApi,
}) => {
	mockApi.seedSettings({
		tributeEntitlementExecutionEnabled: true,
		tributeIdentifiedDonationAutomationEnabled: true,
	});
	mockApi.seedCommerceRules([sponsorDonationRule()]);

	await page.goto("/admin/settings/tribute");
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
			await page.getByLabel("Auto-donation frequency").selectOption(period);
		}
		const publish = page.getByRole("switch", { name: "Publish this sponsor offer" });
		await expect(publish).toBeEnabled();
		await publish.click();
		const requestPromise = page.waitForRequest(
			(request) =>
				request.method() === "POST" &&
				new URL(request.url()).pathname === "/api/debug/admin/commerce/offers",
		);
		await page.getByRole("button", { name: "Create offer" }).click();
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
	await expect(offersSection.getByText("Flexible sponsor donations", { exact: true })).toHaveCount(
		2,
	);
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
	await expect(page.getByText("No active subscription", { exact: true })).toBeVisible();
	await expect(page.getByRole("heading", { name: "Get sponsor access" })).toBeVisible();
	await expect(page.getByText("Monthly sponsor access", { exact: true })).toBeVisible();
	await expect(page.getByText(/500.*month/)).toBeVisible();
	const requestPromise = page.waitForRequest(
		(request) =>
			request.method() === "POST" &&
			new URL(request.url()).pathname === "/api/me/sponsor/checkouts",
	);
	await page.getByRole("button", { name: /Monthly sponsor access/ }).click();
	const request = await requestPromise;
	expect(request.postDataJSON()).toEqual({ offerId: offer.id });
	expect(mockApi.calls).toContain("POST /api/me/sponsor/checkouts");
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
	const activeCard = page.getByRole("region", { name: "Sponsor access is active" });
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
	const yearlyButton = page.getByRole("button", { name: /Yearly sponsor access/ });
	await expect(yearlyButton).toBeDisabled();
	await expect(yearlyButton).toHaveAttribute("aria-describedby", "other-subscriptions-warning");
	await expect(page.getByText("One month sponsor", { exact: true })).toHaveCount(0);
	await yearlyButton.evaluate((element) => (element as HTMLButtonElement).click());
	expect(mockApi.calls).not.toContain("POST /api/me/sponsor/checkouts");
	for (const colorScheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		await activeCard.screenshot({
			path: testInfo.outputPath(`subscription-alternatives-${colorScheme}.png`),
		});
		const activeResult = await new AxeBuilder({ page }).analyze();
		const activeSerious = activeResult.violations.filter((violation) =>
			["serious", "critical"].includes(violation.impact ?? ""),
		);
		expect(activeSerious).toEqual([]);
		await assertNoHorizontalOverflow(page);
	}
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
	await expect(page.getByRole("button", { name: "Resume sponsor access" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Manage in Tribute" })).toHaveCount(0);
	await page.getByRole("button", { name: "Resume sponsor access" }).click();
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
	await expect(page.getByRole("heading", { name: "Sponsor access is active" })).toBeVisible();
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
	await expect(page.getByRole("button", { name: "Resume sponsor access" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Manage auto-donation in Tribute" })).toHaveCount(
		0,
	);
	await expect(page.getByRole("button", { name: "Extend access" })).toHaveCount(0);
	await page.getByRole("button", { name: "Resume sponsor access" }).click();
	await expect(page.getByText("One month sponsor", { exact: true })).toBeVisible();
	await assertNoHorizontalOverflow(page);
});

test("Home keeps base access while offering an upgrade and handles one-time renewal separately", async ({
	page,
	mockApi,
}) => {
	const offer = sponsorSubscriptionOffer();
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
	await expect(page.getByRole("heading", { name: "Sponsor access is active" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Extend access" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Manage in Tribute" })).toHaveCount(0);
	await expect(page.getByText("Monthly sponsor access", { exact: true })).toHaveCount(0);
	await page.getByRole("button", { name: "Extend access" }).click();
	await expect(page.getByText("Monthly sponsor access", { exact: true })).toBeVisible();
});

test("Home blocks duplicate payment while confirmation or access delivery is pending", async ({
	page,
	mockApi,
}) => {
	const offer = sponsorSubscriptionOffer();
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
		offers: [offer],
	});

	await page.goto("/");
	await expect(page.getByRole("heading", { name: "Payment not confirmed yet" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Continue in Tribute" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Check payment status" })).toBeVisible();
	await expect(page.getByText("Monthly sponsor access", { exact: true })).toHaveCount(0);

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

test("checking a completed donation refreshes access and offers every renewal type", async ({
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

	await page.getByRole("button", { name: "Check payment status" }).click();
	const activeCard = page.getByRole("region", { name: "Sponsor access is active" });
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
	await expect(activeCard.getByText("Donation", { exact: true })).toBeVisible();
	await expect(activeCard.getByText("Subscription", { exact: true })).toBeVisible();
	await assertNoHorizontalOverflow(page);
});

test("sponsor checkout card produces reviewable light and dark evidence", async ({
	page,
	mockApi,
}, testInfo) => {
	const offer = sponsorSubscriptionOffer();

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
		await card.screenshot({ path: testInfo.outputPath(`sponsor-card-${colorScheme}.png`) });
		const result = await new AxeBuilder({ page }).analyze();
		const serious = result.violations.filter((violation) =>
			["serious", "critical"].includes(violation.impact ?? ""),
		);
		expect(serious).toEqual([]);
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
		await expect(page.getByRole("region", { name: "Sponsor access is active" })).toBeVisible();
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
		const recurringCard = page.getByRole("region", { name: "Sponsor access is active" });
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
		const card = page.getByRole("region", { name: "Get sponsor access" });
		await expect(card.getByText("Flexible sponsor donation", { exact: true })).toBeVisible();
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
	mockApi.seedSettings({
		tributeEntitlementExecutionEnabled: true,
		tributeIdentifiedDonationAutomationEnabled: true,
	});
	mockApi.seedCommerceRules([sponsorDonationRule()]);

	for (const colorScheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
		await page.goto("/admin/settings/tribute");
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		await page.getByRole("button", { name: "Create first offer" }).click();
		const dialog = page.getByRole("dialog", { name: "Create sponsor offer" });
		await expect(dialog).toBeVisible();
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
