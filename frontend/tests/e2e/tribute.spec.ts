import AxeBuilder from "@axe-core/playwright";
import {
	assertNoHorizontalOverflow,
	entitlementOperation,
	expect,
	mockData,
	test,
} from "./fixtures/mock-api.ts";
import { installVisualViewportMock, setTestVisualViewport } from "./fixtures/visual-viewport.ts";

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
	await expect(page.getByText(/unique payment identity/)).toBeVisible();
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
	await expect(page.getByText(/Digital-product purchases can be planned/)).toBeVisible();
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
}) => {
	mockApi.mock("GET", "/api/debug/admin/commerce/operations", {
		body: {
			operations: [
				entitlementOperation(),
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

	await expect(page.getByText("Digital product 456 purchased", { exact: true })).toBeVisible();
	await expect(page.getByText("Applied", { exact: true })).toBeVisible();
	await expect(page.getByText("One-time donation", { exact: true })).toBeVisible();
	await expect(page.getByText("Needs review", { exact: true })).toBeVisible();
	await expect(page.getByText(/does not document a unique ID/)).toBeVisible();
	await expect(
		page.getByText("Showing the 20 most recent operations.", { exact: true }),
	).toBeVisible();
	await assertNoHorizontalOverflow(page);
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
	await expect(retryEntry.getByText("An administrator queued another attempt.")).toBeVisible();
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
	await page.getByRole("button", { name: "Save" }).click();
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
	await expect(page.getByRole("alert")).toContainText("Could not load automation rules");
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
	await expect(page.getByRole("button", { name: "Save" })).toBeDisabled();
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
