import AxeBuilder from "@axe-core/playwright";
import { assertNoHorizontalOverflow, expect, mockData, test } from "./fixtures/mock-api.ts";

const PAGE_CASES = [
	{
		name: "Home",
		path: "/",
		endpoint: "/api/me/subscription",
		body: mockData.subscription,
		variant: "home",
		readyText: "Account Info",
	},
	{
		name: "Devices",
		path: "/devices",
		endpoint: "/api/me/devices",
		body: mockData.devices,
		variant: "devices",
		readyText: "Connected devices",
	},
	{
		name: "Pulse",
		path: "/pulse",
		endpoint: "/api/debug/pulse",
		body: mockData.pulse,
		variant: "status",
		readyText: "All systems operational",
	},
	{
		name: "Dashboard",
		path: "/admin/dashboard",
		endpoint: "/api/debug/admin/dashboard",
		body: mockData.dashboard,
		variant: "dashboard",
		readyText: "Remnawave unavailable",
	},
	{
		name: "Users",
		path: "/admin/users",
		endpoint: "/api/debug/admin/users/all",
		body: { users: [mockData.adminUser], total: 1 },
		variant: "list",
		readyText: "alice",
	},
	{
		name: "User detail",
		path: "/admin/users/1",
		endpoint: "/api/debug/admin/users/1",
		body: mockData.adminUser,
		variant: "detail",
		readyText: "Deterministic test user",
	},
] as const;

for (const pageCase of PAGE_CASES) {
	test(`${pageCase.name} uses its structural skeleton for initial data`, async ({
		page,
		mockApi,
	}) => {
		mockApi.mock("GET", pageCase.endpoint, { delayMs: 1_000, body: pageCase.body });

		await page.goto(pageCase.path);
		const skeleton = page.locator(
			`[data-ui="loading-skeleton"][data-skeleton-variant="${pageCase.variant}"]`,
		);
		await expect(skeleton).toBeVisible();
		await expect(skeleton).toHaveAttribute("aria-busy", "true");
		await expect(skeleton).toContainText("Loading page…");
		await expect(skeleton.locator('[data-ui="skeleton"]')).not.toHaveCount(0);
		await expect(page.locator('[data-loading-indicator=""]')).toHaveCount(0);
		await assertNoHorizontalOverflow(page);

		const accessibility = await new AxeBuilder({ page })
			.include(`[data-ui="loading-skeleton"][data-skeleton-variant="${pageCase.variant}"]`)
			.analyze();
		expect(
			accessibility.violations.filter((violation) =>
				["serious", "critical"].includes(violation.impact ?? ""),
			),
		).toEqual([]);

		await expect(page.getByText(pageCase.readyText, { exact: false }).first()).toBeVisible();
		await expect(skeleton).toHaveCount(0);
	});
}

test("Settings uses the settings family after auth resolves", async ({ page, mockApi }) => {
	mockApi.mock("GET", "/api/debug/admin/settings", [
		{ body: mockData.settings },
		{ delayMs: 1_000, body: mockData.settings },
	]);

	await page.goto("/admin/settings");
	const skeleton = page.locator('[data-ui="loading-skeleton"][data-skeleton-variant="settings"]');
	await expect(skeleton).toBeVisible();
	await expect(page.locator('[data-loading-indicator=""]')).toHaveCount(0);
	await assertNoHorizontalOverflow(page);
	await expect(page.getByRole("heading", { name: "Flowvy Mini-App" })).toBeVisible();
	await expect(skeleton).toHaveCount(0);
});

test("authentication and onboarding status use the neutral launch skeleton", async ({
	page,
	mockApi,
}) => {
	mockApi.mock("GET", "/api/debug/admin/settings", {
		delayMs: 1_000,
		body: mockData.settings,
	});

	await page.goto("/");
	const launchSkeleton = page.locator('[data-ui="loading-skeleton"]:not([data-skeleton-variant])');
	await expect(launchSkeleton).toBeVisible();
	await expect(launchSkeleton).toHaveAttribute("aria-busy", "true");
	await expect(page.locator('[data-ui="entry-transition"]')).toHaveCount(0);
	await expect(page.locator('[data-loading-indicator=""]')).toHaveCount(0);
	await assertNoHorizontalOverflow(page);
	await expect(page.getByText("Account Info")).toBeVisible();
	await expect(launchSkeleton).toHaveCount(0);
});

const SECTION_CASES = [
	{
		name: "Payment links",
		path: "/admin/settings/tribute/payment-links",
		endpoint: "/api/debug/admin/commerce/catalog",
		body: mockData.commerceCatalog,
		contextText: "Subscription links",
		readyText: "Supporter",
	},
	{
		name: "Automation rules",
		path: "/admin/settings/tribute/automation-rules",
		endpoint: "/api/debug/admin/commerce/rules",
		body: [],
		contextText: "Map payments to access",
		readyText: "No automation rules",
	},
	{
		name: "Sponsor offers",
		path: "/admin/settings/tribute/sponsor-offers",
		endpoint: "/api/debug/admin/commerce/offers",
		body: [],
		contextText: "Publish payment choices on Home",
		readyText: "No sponsor offers",
	},
	{
		name: "Payment activity",
		path: "/admin/settings/tribute/activity",
		endpoint: "/api/debug/admin/commerce/operations",
		body: { operations: [], hasMore: false },
		contextText: "Payment activity",
		readyText: "No events yet",
	},
] as const;

for (const sectionCase of SECTION_CASES) {
	test(`${sectionCase.name} progressively reveals its independent section`, async ({
		page,
		mockApi,
	}) => {
		mockApi.mock("GET", sectionCase.endpoint, { delayMs: 1_000, body: sectionCase.body });

		await page.goto(sectionCase.path);
		await expect(page.getByText(sectionCase.contextText, { exact: false }).first()).toBeVisible();
		const sectionSkeleton = page.locator(
			'[data-ui="loading-skeleton"]:not([data-skeleton-variant])',
		);
		await expect(sectionSkeleton).toBeVisible();
		await expect(page.locator('[data-loading-indicator=""]')).toHaveCount(0);
		await assertNoHorizontalOverflow(page);
		await expect(page.getByText(sectionCase.readyText, { exact: false }).first()).toBeVisible();
		await expect(sectionSkeleton).toHaveCount(0);
	});
}

test("representative skeleton families remain stable in light and dark themes", async ({
	page,
	mockApi,
}, testInfo) => {
	for (const colorScheme of ["light", "dark"] as const) {
		mockApi.mock("GET", "/api/debug/admin/dashboard", {
			delayMs: 2_000,
			body: mockData.dashboard,
		});
		await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
		await page.goto("/admin/dashboard");
		await page.evaluate(
			(theme) => document.documentElement.setAttribute("data-theme", theme),
			colorScheme,
		);
		const skeleton = page.locator(
			'[data-ui="loading-skeleton"][data-skeleton-variant="dashboard"]',
		);
		await expect(skeleton).toBeVisible();
		await expect(skeleton.locator('[data-ui="skeleton"]').first()).toHaveCSS(
			"animation-name",
			"none",
		);
		await assertNoHorizontalOverflow(page);
		await page.screenshot({
			path: testInfo.outputPath(`dashboard-skeleton-${colorScheme}.png`),
			animations: "disabled",
		});
	}
});
