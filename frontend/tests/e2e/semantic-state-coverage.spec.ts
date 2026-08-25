import type { Locator, Page } from "@playwright/test";
import { assertNoHorizontalOverflow, expect, mockData, test } from "./fixtures/mock-api.ts";
import { expectSurfaceContract, noOutline } from "./helpers/surface-contract.ts";

const edge = (color: string) => ({ width: "1px", style: "solid", color });

async function tokenColor(page: Page, token: string): Promise<string> {
	return page.evaluate((name) => {
		const probe = document.createElement("span");
		probe.style.color = `var(${name})`;
		document.body.append(probe);
		const color = getComputedStyle(probe).color;
		probe.remove();
		return color;
	}, token);
}

async function expectUniformCard(locator: Locator, backgroundToken: string, borderToken: string) {
	await expectSurfaceContract(locator, {
		background: `var(${backgroundToken})`,
		border: edge(`var(${borderToken})`),
		outline: noOutline(),
		boxShadow: "none",
		color: "var(--v2-text-primary)",
	});
}

const offer = {
	id: "30000000-0000-4000-8000-000000000001",
	title: "Sponsor access",
	description: "Support keeps the service available.",
	commerceRuleId: "10000000-0000-4000-8000-000000000012",
	isPublished: true,
	sortOrder: 10,
	provider: "tribute",
	commerceType: "subscription",
	paymentMode: "recurring",
	externalItemId: "12",
	checkoutUrl: "https://t.me/tribute/app?startapp=subscription_12",
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

test("renders every previously missing Sponsor state on the neutral outer surface", async ({
	page,
	mockApi,
}) => {
	const states = [
		{
			status: "one_time_expired",
			title: "Extended access expired",
			accessLevel: "base",
			primaryAction: "renew",
			paidExpiresAt: "2026-08-01T00:00:00Z",
			managementUrl: null,
			active: false,
		},
		{
			status: "recurring_trial",
			title: "Extended access trial is active",
			accessLevel: "paid",
			primaryAction: "manage_subscription",
			paidExpiresAt: "2027-08-01T00:00:00Z",
			managementUrl: "https://t.me/tribute/app?startapp=manage",
			active: true,
		},
		{
			status: "refunded",
			title: "Payment was refunded",
			accessLevel: "base",
			primaryAction: "renew",
			paidExpiresAt: null,
			managementUrl: null,
			active: false,
		},
	] as const;

	for (const theme of ["light", "dark"] as const) {
		for (const state of states) {
			mockApi.seedSponsorState({
				status: state.status,
				accessLevel: state.accessLevel,
				primaryAction: state.primaryAction,
				paidExpiresAt: state.paidExpiresAt,
				baseExpiresAt: null,
				currentOfferId: state.active ? offer.id : null,
				managementUrl: state.managementUrl,
				pendingCheckout: null,
				offers: [offer],
			});
			await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
			await page.goto("/");
			await page.evaluate(
				(value) => document.documentElement.setAttribute("data-theme", value),
				theme,
			);
			const heading = page.getByRole("heading", { name: state.title });
			await expect(heading).toBeVisible();
			const card = heading.locator("xpath=ancestor::section[1]");
			await expectUniformCard(card, "--v2-bg-primary", "--v2-border-tertiary");
			const icon = card.locator(`[data-status="${state.status}"]`);
			if (state.active) await expect(icon).toHaveAttribute("data-active", "true");
			else await expect(icon).not.toHaveAttribute("data-active");
			await expect(icon).toHaveCSS(
				"color",
				await tokenColor(page, state.active ? "--v2-icon-positive" : "--v2-icon-secondary"),
			);
			await assertNoHorizontalOverflow(page);
		}
	}
});

test("renders every unavailable Sponsor offer reason with warning hierarchy", async ({
	page,
	mockApi,
}) => {
	const availability = [
		["rule_disabled", "Rule disabled"],
		["profile_unavailable", "Profile unavailable"],
		["configuration_changed", "Republish required"],
	] as const;
	const offers = availability.map(([value], index) => ({
		...offer,
		id: `30000000-0000-4000-8000-00000000000${index + 2}`,
		title: `Offer ${index + 1}`,
		commerceRuleId: `10000000-0000-4000-8000-00000000001${index + 3}`,
		externalItemId: String(index + 20),
		availability: value,
	}));
	const rules = availability.map(([value], index) => ({
		id: offers[index].commerceRuleId,
		provider: "tribute",
		name: `Warning state rule ${index + 1}`,
		commerceType: "subscription",
		paymentMode: "recurring",
		externalItemId: offers[index].externalItemId,
		currency: "RUB",
		calculationType: "provider_expiry",
		fixedDurationDays: null,
		amountBands: [],
		accessProfileId:
			value === "profile_unavailable"
				? "00000000-0000-4000-8000-000000000099"
				: "00000000-0000-4000-8000-000000000001",
		grantMode: "replace",
		priority: 100 + index,
		isEnabled: value !== "rule_disabled",
	}));

	for (const theme of ["light", "dark"] as const) {
		mockApi.seedCommerceRules(rules);
		mockApi.seedSponsorOffers(offers);
		await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
		await page.goto("/admin/settings/tribute/sponsor-offers");
		await page.evaluate(
			(value) => document.documentElement.setAttribute("data-theme", value),
			theme,
		);
		for (const [value, label] of availability) {
			const badge = page.locator(`[data-availability="${value}"]`, { hasText: label });
			await expectSurfaceContract(badge, {
				background: "var(--v2-bg-warning)",
				border: edge("var(--v2-border-warning-secondary)"),
				outline: noOutline(),
				boxShadow: "none",
				color: "var(--v2-text-warning)",
			});
			const management = badge.locator("xpath=ancestor::*[@data-published][1]");
			const card = management.getByRole("article");
			await expectSurfaceContract(card, {
				background: "var(--v2-bg-primary)",
				border: edge("var(--v2-border-positive-secondary)"),
				outline: noOutline(),
				boxShadow: "inset 3px 0 0 var(--v2-border-positive-primary)",
				color: "var(--v2-text-primary)",
			});
		}
		await assertNoHorizontalOverflow(page);
	}
});

test("renders positive, negative, and zero dashboard deltas with explicit text roles", async ({
	page,
	mockApi,
}) => {
	const remnawaveStats = {
		cpu: { cores: 8 },
		memory: { total: 16 * 1024 ** 3, free: 8 * 1024 ** 3, used: 8 * 1024 ** 3 },
		uptime: 864000,
		users: {
			statusCounts: { ACTIVE: 10, DISABLED: 2, LIMITED: 3, EXPIRED: 4, UNKNOWN: 1 },
			totalUsers: 20,
		},
		onlineStats: { onlineNow: 5, lastDay: 8, lastWeek: 12, neverOnline: 1 },
		nodes: { totalOnline: 2, totalBytesLifetime: "1024" },
	};
	const differences = ["+50%", "-25%", "0%"] as const;
	const labels = ["↑ +50%", "↓ 25%", "↑ 0%"] as const;

	for (const theme of ["light", "dark"] as const) {
		for (const [index, difference] of differences.entries()) {
			const period = { current: "1.5 TB", previous: "1.0 TB", difference };
			mockApi.mock("GET", "/api/debug/admin/dashboard", {
				body: {
					...mockData.dashboard,
					remnawaveStats,
					remnawaveBandwidth: {
						bandwidthLastTwoDays: period,
						bandwidthLastSevenDays: period,
						bandwidthLast30Days: period,
						bandwidthCalendarMonth: period,
						bandwidthCurrentYear: period,
					},
				},
			});
			await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
			await page.goto("/admin/dashboard");
			await page.evaluate(
				(value) => document.documentElement.setAttribute("data-theme", value),
				theme,
			);
			const delta = page.getByText(labels[index], { exact: true }).first();
			await expect(delta).toBeVisible();
			await expect(delta).toHaveCSS(
				"color",
				await tokenColor(
					page,
					difference.startsWith("-") ? "--v2-text-negative" : "--v2-text-positive",
				),
			);
			await assertNoHorizontalOverflow(page);
		}
	}
});
