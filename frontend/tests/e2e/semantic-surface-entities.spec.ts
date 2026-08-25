import type { Locator, Page } from "@playwright/test";
import { entitlementOperation, expect, mockData, test } from "./fixtures/mock-api.ts";
import { expectSurfaceContract, noEdge, noOutline } from "./helpers/surface-contract.ts";

type Theme = "light" | "dark";

const themes: readonly Theme[] = ["light", "dark"];
const edge = (color: string) => ({ width: "1px", style: "solid", color });

async function applyTheme(page: Page, theme: Theme): Promise<void> {
	await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
	await page.evaluate((selectedTheme) => {
		document.documentElement.setAttribute("data-theme", selectedTheme);
	}, theme);
	await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
	await page.evaluate(() => document.fonts.ready);
}

async function tokenColor(page: Page, token: `--v2-${string}`): Promise<string> {
	return page.evaluate((name) => {
		const probe = document.createElement("span");
		probe.style.color = `var(${name})`;
		document.body.append(probe);
		const color = getComputedStyle(probe).color;
		probe.remove();
		return color;
	}, token);
}

async function expectVisibleOutline(
	locator: Locator,
	color: string,
	offset: "2px" | "-2px",
): Promise<void> {
	await expect(locator).toHaveCSS("outline-color", color);
	await expect(locator).toHaveCSS("outline-style", "solid");
	await expect(locator).toHaveCSS("outline-offset", offset);
	const width = await locator.evaluate((element) =>
		Number.parseFloat(getComputedStyle(element).outlineWidth),
	);
	// Browsers snap the declared 1.5 CSS pixels to their device-pixel grid.
	expect(width).toBeGreaterThanOrEqual(1);
	expect(width).toBeLessThanOrEqual(1.5);
}

test("Admin Users keeps individual cards and every row role in both themes", async ({
	page,
	mockApi,
}, testInfo) => {
	const trafficLimitBytes = 100 * 1024 ** 3;
	const statuses = ["ACTIVE", "LIMITED", "DISABLED", "EXPIRED", "UNKNOWN"] as const;
	const trafficPercent = [10, 80, 95, 0, 50] as const;
	const expiry = [
		new Date(Date.now() + 100 * 86_400_000).toISOString(),
		new Date(Date.now() + 2 * 86_400_000).toISOString(),
		new Date(Date.now() - 100 * 86_400_000).toISOString(),
		new Date(Date.now() - 86_400_000).toISOString(),
		"2100-01-01T00:00:00Z",
	] as const;
	const users = statuses.map((status, index) => ({
		...mockData.adminUser,
		id: index + 1,
		username: `surface-${status.toLowerCase()}`,
		telegramUsername: null,
		status,
		trafficLimitBytes,
		expireAt: expiry[index],
		userTraffic: {
			...mockData.adminUser.userTraffic,
			usedTrafficBytes: trafficLimitBytes * (trafficPercent[index] / 100),
		},
	}));
	mockApi.mock("GET", "/api/debug/admin/users/all", {
		body: { users, total: users.length },
	});

	for (const theme of themes) {
		await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
		await page.goto("/admin/users");
		await applyTheme(page, theme);

		const colors = {
			primarySurface: await tokenColor(page, "--v2-bg-primary"),
			secondarySurface: await tokenColor(page, "--v2-bg-secondary"),
			tertiarySurface: await tokenColor(page, "--v2-bg-tertiary"),
			positiveSurface: await tokenColor(page, "--v2-bg-positive-quaternary"),
			positiveBadgeSurface: await tokenColor(page, "--v2-bg-positive-tertiary"),
			positive: await tokenColor(page, "--v2-text-positive"),
			warningSurface: await tokenColor(page, "--v2-bg-warning"),
			warning: await tokenColor(page, "--v2-text-warning"),
			negativeSurface: await tokenColor(page, "--v2-bg-negative-secondary"),
			negative: await tokenColor(page, "--v2-text-negative"),
			secondaryText: await tokenColor(page, "--v2-text-secondary"),
			tertiaryIcon: await tokenColor(page, "--v2-icon-tertiary"),
			tertiaryBorder: await tokenColor(page, "--v2-border-tertiary"),
			positiveBorder: await tokenColor(page, "--v2-border-positive-secondary"),
			warningBorder: await tokenColor(page, "--v2-border-warning-secondary"),
			negativeBorder: await tokenColor(page, "--v2-border-negative-secondary"),
			focus: await tokenColor(page, "--v2-bg-positive-primary"),
		};

		const list = page.getByRole("list", { name: "Users list" });
		await expect(list.getByRole("listitem")).toHaveCount(statuses.length);
		await page.mouse.move(0, 0);

		const badgeRoles = {
			ACTIVE: {
				label: "Active",
				background: colors.positiveBadgeSurface,
				border: colors.positiveBorder,
				text: colors.positive,
			},
			LIMITED: {
				label: "Limited",
				background: colors.warningSurface,
				border: colors.warningBorder,
				text: colors.warning,
			},
			DISABLED: {
				label: "Disabled",
				background: colors.secondarySurface,
				border: colors.tertiaryBorder,
				text: colors.secondaryText,
			},
			EXPIRED: {
				label: "Expired",
				background: colors.negativeSurface,
				border: colors.negativeBorder,
				text: colors.negative,
			},
			UNKNOWN: {
				label: "Unknown status",
				background: colors.secondarySurface,
				border: colors.tertiaryBorder,
				text: colors.secondaryText,
			},
		} as const;
		const trafficRoles = [
			colors.positive,
			colors.warning,
			colors.negative,
			colors.positive,
			colors.positive,
		] as const;

		for (const [index, status] of statuses.entries()) {
			const row = list.getByRole("button").filter({
				has: page.getByText(`surface-${status.toLowerCase()}`, { exact: true }),
			});
			const card = row.locator("..");
			const badge = row.getByText(badgeRoles[status].label, { exact: true });

			await expect(row).toBeVisible();
			await expectSurfaceContract(card, {
				background: "var(--v2-bg-primary)",
				border: edge("var(--v2-border-tertiary)"),
				outline: noOutline(),
				boxShadow: "none",
				color: "var(--v2-text-primary)",
			});
			await expectSurfaceContract(row, {
				background: "transparent",
				border: noEdge(),
				outline: noOutline(),
				boxShadow: "none",
				color: "var(--v2-text-primary)",
			});
			await expectSurfaceContract(badge, {
				background:
					status === "ACTIVE"
						? "var(--v2-bg-positive-tertiary)"
						: status === "LIMITED"
							? "var(--v2-bg-warning)"
							: status === "EXPIRED"
								? "var(--v2-bg-negative-secondary)"
								: "var(--v2-bg-secondary)",
				border: edge(
					status === "ACTIVE"
						? "var(--v2-border-positive-secondary)"
						: status === "LIMITED"
							? "var(--v2-border-warning-secondary)"
							: status === "EXPIRED"
								? "var(--v2-border-negative-secondary)"
								: "var(--v2-border-tertiary)",
				),
				outline: noOutline(),
				boxShadow: "none",
				color:
					status === "ACTIVE"
						? "var(--v2-text-positive)"
						: status === "LIMITED"
							? "var(--v2-text-warning)"
							: status === "EXPIRED"
								? "var(--v2-text-negative)"
								: "var(--v2-text-secondary)",
			});
			await expect(row.locator(".lucide-chevron-right")).toHaveCSS("color", colors.tertiaryIcon);
			await expect(row.locator('[class*="trafficBar_"]')).toHaveCSS(
				"background-color",
				colors.tertiarySurface,
			);
			await expect(row.locator('[class*="trafficBarFill_"]')).toHaveCSS(
				"background-color",
				trafficRoles[index],
			);
		}

		const activeRow = list.getByRole("button").filter({
			has: page.getByText("surface-active", { exact: true }),
		});
		await activeRow.focus();
		await expect(activeRow).toBeFocused();
		await expectVisibleOutline(activeRow, colors.focus, "2px");

		const normalExpiry = activeRow.locator('[class*="expiry_"]');
		const warningExpiry = list
			.getByRole("button")
			.filter({ has: page.getByText("surface-limited", { exact: true }) })
			.locator('[class*="expiry_"]');
		const negativeExpiry = list
			.getByRole("button")
			.filter({ has: page.getByText("surface-disabled", { exact: true }) })
			.locator('[class*="expiry_"]');
		await expect(normalExpiry).toHaveCSS("color", colors.secondaryText);
		await expect(warningExpiry).toHaveCSS("color", colors.warning);
		await expect(negativeExpiry).toHaveCSS("color", colors.negative);

		if (testInfo.project.name === "desktop-chromium") {
			const card = activeRow.locator("..");
			await activeRow.hover();
			await expect(card).toHaveCSS("background-color", colors.positiveSurface);
			await expect(card).toHaveCSS("border-color", colors.tertiaryBorder);
			await page.mouse.move(0, 0);
			await expect(card).toHaveCSS("background-color", colors.primarySurface);
		}
	}
});

test("Tribute Activity exposes every status, unknown labels, pagination, and operation focus", async ({
	page,
	mockApi,
}) => {
	const statusFixtures = [
		{ status: "pending", label: "Queued", tone: "default" },
		{ status: "processing", label: "Applying", tone: "default" },
		{ status: "retry", label: "Retry scheduled", tone: "warning" },
		{ status: "applied", label: "Applied", tone: "positive" },
		{ status: "review", label: "Needs review", tone: "warning" },
		{ status: "resolved", label: "Resolved", tone: "default" },
		{ status: "cancelled", label: "Cancelled", tone: "default" },
	] as const;
	const operations = statusFixtures.map(({ status }, index) =>
		entitlementOperation({
			id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
			status,
			eventName: "new_subscription",
			externalItemId: String(index + 1),
		}),
	);
	operations.push(
		entitlementOperation({
			id: "20000000-0000-4000-8000-000000000099",
			status: "review",
			eventName: "future_tribute_event",
			reasonCode: "future_safe_review_reason",
			externalItemId: "future-item",
		}),
	);
	mockApi.mock("GET", "/api/debug/admin/commerce/operations", {
		body: { operations, hasMore: true },
	});

	for (const theme of themes) {
		await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
		await page.goto("/admin/settings/tribute/activity");
		await applyTheme(page, theme);

		const colors = {
			secondaryText: await tokenColor(page, "--v2-text-secondary"),
			positive: await tokenColor(page, "--v2-text-positive"),
			warning: await tokenColor(page, "--v2-text-warning"),
			focus: await tokenColor(page, "--v2-bg-positive-primary"),
		};
		const articles = page.locator("[data-entitlement-operation]");
		await expect(articles).toHaveCount(operations.length);

		for (const [index, fixture] of statusFixtures.entries()) {
			const status = articles.nth(index).getByText(fixture.label, { exact: true });
			const expectedColor =
				fixture.tone === "positive"
					? colors.positive
					: fixture.tone === "warning"
						? colors.warning
						: colors.secondaryText;
			await expect(status).toHaveCSS("color", expectedColor);
			await expect(status.locator("span")).toHaveCSS("background-color", expectedColor);
		}

		const unknown = articles.last();
		await expect(unknown.getByText("Unsupported Tribute event", { exact: true })).toBeVisible();
		await expect(
			unknown.getByText("Automatic processing stopped for a safe review", { exact: false }),
		).toBeVisible();
		await expect(
			page.getByText("Showing the 20 most recent operations", { exact: true }),
		).toBeVisible();

		const focusedOperation = articles.first();
		await expectSurfaceContract(focusedOperation, {
			background: "transparent",
			border: noEdge(),
			outline: noOutline(),
			boxShadow: "none",
			color: "var(--v2-text-primary)",
		});
		await focusedOperation.focus();
		await expect(focusedOperation).toBeFocused();
		await expectVisibleOutline(focusedOperation, colors.focus, "-2px");
	}
});

test("Device platform SVGs keep semantic computed color, fill, and stroke roles", async ({
	page,
	mockApi,
}) => {
	const platforms = ["android", "ios", "macos", "windows", "linux", "solaris"] as const;
	const devices = platforms.map((platform, index) => ({
		...mockData.devices.devices[0],
		hwid: `semantic-platform-${index + 1}`,
		platform,
		deviceModel: `${platform} semantic device`,
	}));
	mockApi.mock("GET", "/api/me/devices", {
		body: { devices, total: devices.length, limit: 10 },
	});

	for (const theme of themes) {
		await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
		await page.goto("/devices");
		await applyTheme(page, theme);

		const colors = {
			secondary: await tokenColor(page, "--v2-icon-secondary"),
			secondarySurface: await tokenColor(page, "--v2-bg-secondary"),
			warningIcon: await tokenColor(page, "--v2-icon-warning"),
		};
		const android = page.getByRole("img", { name: "Android" });
		const ios = page.getByRole("img", { name: "iOS" });
		const macos = page.getByRole("img", { name: "macOS" });
		const windows = page.getByRole("img", { name: "Windows" });
		const linux = page.getByRole("img", { name: "Linux" });
		const unknown = page.getByRole("img", { name: "Unknown device" });

		for (const icon of [android, ios, macos, windows, linux, unknown]) {
			await expect(icon).toBeVisible();
			await expect(icon).toHaveCSS("color", colors.secondary);
		}

		await expect(android.locator("path").first()).toHaveCSS("fill", colors.secondary);
		await expect(android.locator("path").nth(1)).toHaveCSS("fill", "none");
		await expect(android.locator("path").nth(1)).toHaveCSS("stroke", colors.secondary);
		await expect(android.locator("circle").first()).toHaveCSS("fill", colors.secondarySurface);
		await expect(ios.locator("path")).toHaveCSS("fill", colors.secondary);
		await expect(macos.locator("path")).toHaveCSS("fill", colors.secondary);
		await expect(windows.locator("path")).toHaveCSS("fill", colors.secondary);
		await expect(linux.locator("path").first()).toHaveCSS("fill", colors.secondary);
		await expect(linux.locator("path").nth(1)).toHaveCSS("fill", colors.warningIcon);
		await expect(linux.locator("ellipse").first()).toHaveCSS("fill", colors.secondarySurface);
		await expect(unknown.locator("circle")).toHaveCSS("fill", "none");
		await expect(unknown.locator("circle")).toHaveCSS("stroke", colors.secondary);
		await expect(unknown.locator("path")).toHaveCSS("fill", "none");
		await expect(unknown.locator("path")).toHaveCSS("stroke", colors.secondary);
	}
});
