import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { assertNoHorizontalOverflow, expect, mockData, test } from "./fixtures/mock-api.ts";
import {
	installTelegramMainButton,
	pressTelegramMainButton,
	withTelegramMainButton,
} from "./fixtures/telegram-main-button.ts";

async function analyzeWithoutExpectedViewportZoomRestriction(page: Page) {
	const { violations } = await new AxeBuilder({ page }).analyze();
	const viewportViolations = violations.filter((violation) => violation.id === "meta-viewport");
	expect(viewportViolations).toHaveLength(1);
	expect(viewportViolations[0]?.nodes).toHaveLength(1);
	expect(
		viewportViolations[0]?.nodes[0]?.any.some(
			(check) => check.id === "meta-viewport" && check.data === "maximum-scale",
		),
	).toBe(true);
	return violations.filter((violation) => violation.id !== "meta-viewport");
}

async function assertOnlyExpectedViewportZoomRestriction(page: Page): Promise<void> {
	expect(await analyzeWithoutExpectedViewportZoomRestriction(page)).toEqual([]);
}

test("authentication retry and direct admin denial are explicit", async ({
	page,
	mockApi: _mock,
}) => {
	await page.addInitScript(() => {
		if (!sessionStorage.getItem("flowvy:auth-state-initialized")) {
			localStorage.setItem("flowvy:mock-auth", "unauthenticated");
			sessionStorage.setItem("flowvy:auth-state-initialized", "true");
		}
	});
	await page.goto("/");
	await expect(page.getByRole("heading", { name: "Unable to sign in" })).toBeVisible();
	await expect(page.getByRole("alert")).toContainText(
		"Authentication could not be completed. Reopen the Mini App or try again",
	);

	await page.evaluate(() => localStorage.removeItem("flowvy:mock-auth"));
	await page.getByRole("button", { name: "Retry" }).click();
	await expect(page.getByText("Account Info")).toBeVisible();
	await page.waitForLoadState("networkidle");

	await page.evaluate(() => localStorage.setItem("flowvy:mock-role", "user"));
	await page.reload();
	await expect(page.getByRole("main").locator(":scope > div")).toHaveCSS("opacity", "1");
	await page.goto("/admin/settings");
	await expect(page.getByRole("alert")).toContainText("Access denied");
	await expect(page.getByRole("button", { name: "Back to app" })).toBeVisible();
	await expect(page.getByRole("link", { name: "Home" })).toBeVisible();
	await expect(page.getByRole("link", { name: "Dashboard" })).toHaveCount(0);
	await assertNoHorizontalOverflow(page);
});

test("stable authentication codes use localized copy instead of backend diagnostics", async ({
	page,
	mockApi,
}) => {
	await page.addInitScript(() => localStorage.setItem("flowvy:mock-auth", "onboarding"));
	mockApi.mock("GET", "/api/me", {
		status: 403,
		body: {
			detail: {
				code: "account_disabled",
				message: "Raw backend account diagnostic",
			},
		},
	});

	await page.goto("/");
	const errorState = page.getByRole("alert");
	await expect(errorState).toContainText(
		"This account is disabled. Contact support if you think this is a mistake",
	);
	await expect(errorState).not.toContainText("Raw backend account diagnostic");
});

test("subscription loading, active, absent, and provider error states render safely", async ({
	page,
	mockApi,
}) => {
	mockApi.mock("GET", "/api/me/subscription", [
		{ delayMs: 1500, body: mockData.subscription },
		{ status: 404, body: { detail: "No active subscription found" } },
		{ status: 404, body: { detail: "No active subscription found" } },
		{ status: 502, body: { detail: "Remnawave unavailable" } },
		{ status: 502, body: { detail: "Remnawave unavailable" } },
	]);

	await page.goto("/");
	await expect(
		page.locator('[data-ui="loading-skeleton"][data-skeleton-variant="home"]'),
	).toBeVisible();
	await expect(page.getByText("Account Info")).toBeVisible();
	await expect(page.getByText("Active", { exact: true })).toBeVisible();

	await page.reload();
	const emptySubscriptionCard = page.getByRole("article", { name: "No active subscription" });
	await expect(emptySubscriptionCard).toBeVisible();
	await expect(emptySubscriptionCard).toHaveText("No active subscription");
	const accessibility = await new AxeBuilder({ page })
		.include('article[aria-label="No active subscription"]')
		.analyze();
	expect(
		accessibility.violations.filter((violation) =>
			["serious", "critical"].includes(violation.impact ?? ""),
		),
	).toEqual([]);

	await page.reload();
	await expect(page.getByRole("heading", { name: "Unable to load data" })).toBeVisible();
	await assertNoHorizontalOverflow(page);
});

test("Home reports a rejected subscription-link copy through the shared action error", async ({
	page,
	mockApi: _mock,
}, testInfo) => {
	await installTelegramMainButton(page);
	await page.goto(withTelegramMainButton("/"));
	await page.evaluate(() => {
		Object.defineProperty(navigator, "clipboard", {
			configurable: true,
			value: {
				writeText: () => Promise.reject(new DOMException("Clipboard denied", "NotAllowedError")),
			},
		});
	});

	await page.getByRole("button", { name: "Copy subscription link" }).click();
	const error = page
		.getByRole("alert")
		.filter({ hasText: "Could not copy the subscription link. Try again" });
	await expect(error).toBeFocused();
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					(
						window as typeof window & {
							__telegramEvents?: Array<{ eventType: string; eventData?: string }>;
						}
					).__telegramEvents?.filter(
						(event) => event.eventType === "web_app_trigger_haptic_feedback",
					).length ?? 0,
			),
		)
		.toBe(1);
	await assertNoHorizontalOverflow(page);
	if (testInfo.project.name === "mobile-chromium") {
		await page.screenshot({ path: testInfo.outputPath("home-copy-action-error-dark.png") });
		await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
		await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
		await expect
			.poll(() => error.evaluate((element) => getComputedStyle(element).backgroundColor))
			.toBe("rgb(254, 238, 237)");
		await page.screenshot({ path: testInfo.outputPath("home-copy-action-error-light.png") });
	}
});

test("Home opens setup instructions as the primary action and keeps copy secondary", async ({
	page,
	mockApi: _mock,
}, testInfo) => {
	await installTelegramMainButton(page);
	await page.goto(withTelegramMainButton("/"));

	const openButton = page.getByRole("button", { name: "Open setup instructions" });
	const copyButton = page.getByRole("button", { name: "Copy subscription link" });
	await expect(openButton).toBeVisible();
	await expect(copyButton).toBeVisible();
	expect(
		await openButton.evaluate((button) => button.nextElementSibling?.textContent?.trim()),
	).toBe("Copy subscription link");
	await openButton.click();
	await expect
		.poll(() =>
			page.evaluate(() => {
				const telegramWindow = window as typeof window & {
					__telegramEvents?: Array<{ eventType: string; eventData?: string }>;
				};
				return telegramWindow.__telegramEvents
					?.filter((event) => event.eventType === "web_app_open_link")
					.at(-1)?.eventData;
			}),
		)
		.toContain("https://panel.example.test/sub/user-1");

	await page.goto("/");
	await expect(openButton).toBeVisible();

	for (const theme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
		await page.evaluate((nextTheme) => {
			document.documentElement.setAttribute("data-theme", nextTheme);
		}, theme);
		await page.evaluate(
			() =>
				new Promise<void>((resolve) => {
					requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
				}),
		);

		const hierarchy = await page.evaluate(() => {
			const buttons = Array.from(document.querySelectorAll("button"));
			const open = buttons.find((button) =>
				button.textContent?.includes("Open setup instructions"),
			);
			const copy = buttons.find((button) => button.textContent?.includes("Copy subscription link"));
			if (!open || !copy) throw new Error("Subscription actions are missing");

			const resolveColor = (token: string) => {
				const probe = document.createElement("span");
				probe.style.color = `var(${token})`;
				document.body.append(probe);
				const resolved = getComputedStyle(probe).color;
				probe.remove();
				return resolved;
			};
			const expected = {
				primaryBackground: resolveColor("--v2-bg-primary-inverted"),
				primaryText: resolveColor("--v2-text-primary-inverted"),
				secondaryBorder: resolveColor("--v2-border-secondary"),
				secondaryText: resolveColor("--v2-text-secondary"),
			};
			const openStyles = getComputedStyle(open);
			const copyStyles = getComputedStyle(copy);
			return {
				expected,
				actual: {
					primaryBackground: openStyles.backgroundColor,
					primaryText: openStyles.color,
					secondaryBackground: copyStyles.backgroundColor,
					secondaryBorder: copyStyles.borderColor,
					secondaryText: copyStyles.color,
				},
			};
		});
		expect(hierarchy.actual).toEqual({
			primaryBackground: hierarchy.expected.primaryBackground,
			primaryText: hierarchy.expected.primaryText,
			secondaryBackground: "rgba(0, 0, 0, 0)",
			secondaryBorder: hierarchy.expected.secondaryBorder,
			secondaryText: hierarchy.expected.secondaryText,
		});
		expect(
			(await new AxeBuilder({ page }).include('[data-ui="subscription-actions"]').analyze())
				.violations,
		).toEqual([]);
		await page.locator("main").screenshot({
			path: testInfo.outputPath(`home-subscription-actions-${theme}.png`),
			animations: "disabled",
		});
	}
	await assertNoHorizontalOverflow(page);
});

test("device confirmations support cancel, failure, and successful remove-all", async ({
	page,
	mockApi,
}) => {
	const twoDevices = {
		devices: [
			mockData.devices.devices[0],
			{
				...mockData.devices.devices[0],
				hwid: "device-2",
				platform: "windows",
				deviceModel: "A very long workstation name that must fit a narrow mobile screen",
			},
		],
		total: 2,
		limit: 2,
	};
	mockApi.mock("GET", "/api/me/devices", [
		{ body: twoDevices },
		{ body: { devices: [], total: 0, limit: 2 } },
	]);
	mockApi.mock("DELETE", "/api/me/devices/device-1", {
		status: 502,
		body: { detail: "Provider unavailable" },
	});

	await page.goto("/devices");
	const firstDeleteButton = page.getByRole("button", { name: "Delete device" }).first();
	const firstDeviceName = page.getByText("Pixel 8", { exact: true });
	const firstAddedDate = page.locator("time").first();
	const [nameBefore, addedBefore] = await Promise.all([
		firstDeviceName.boundingBox(),
		firstAddedDate.boundingBox(),
	]);
	await firstDeleteButton.click();
	const deviceDialog = page.getByRole("alertdialog", { name: "Remove device?" });
	await expect(deviceDialog).toBeVisible();
	const deviceConfirmCopy = deviceDialog.getByText(
		"Pixel 8 will be removed from your connected devices",
	);
	await expect(deviceConfirmCopy).toBeVisible();
	await expect(deviceDialog.getByRole("heading", { name: "Remove device?" })).toBeFocused();
	const [nameAfter, addedAfter] = await Promise.all([
		firstDeviceName.boundingBox(),
		firstAddedDate.boundingBox(),
	]);
	expect(nameAfter).toEqual(nameBefore);
	expect(addedAfter).toEqual(addedBefore);
	const [addedDateBox, updatedLabelBox] = await Promise.all([
		firstAddedDate.boundingBox(),
		page.getByText("Updated", { exact: true }).first().boundingBox(),
	]);
	expect((addedDateBox?.x ?? 0) + (addedDateBox?.width ?? 0)).toBeLessThan(updatedLabelBox?.x ?? 0);
	await expect
		.poll(() =>
			deviceDialog.evaluate(
				(element) =>
					element
						.getAnimations({ subtree: true })
						.filter((animation) => animation.playState !== "finished").length,
			),
		)
		.toBe(0);
	const accessibilityByTheme: Array<{ theme: "light" | "dark"; violations: unknown[] }> = [];
	for (const colorScheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		await expect(deviceDialog).toHaveCSS(
			"background-color",
			colorScheme === "dark" ? "rgb(23, 23, 23)" : "rgb(242, 242, 242)",
		);
		await expect(deviceConfirmCopy).toHaveCSS(
			"color",
			colorScheme === "dark" ? "rgb(163, 163, 163)" : "rgb(69, 69, 69)",
		);
		accessibilityByTheme.push({
			theme: colorScheme,
			violations: await analyzeWithoutExpectedViewportZoomRestriction(page),
		});
	}
	await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
	await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
	await page.keyboard.press("Escape");
	await expect(deviceDialog).toHaveCount(0);
	await expect(firstDeleteButton).toBeFocused();

	await firstDeleteButton.click();
	await deviceDialog.getByRole("button", { name: "Remove", exact: true }).click();
	await expect(page.getByRole("alert")).toContainText("Could not remove the device");
	await expect(deviceDialog.getByRole("button", { name: "Cancel" })).toBeVisible();

	await deviceDialog.getByRole("button", { name: "Cancel" }).click();
	await page.getByRole("button", { name: "Remove all devices" }).click();
	const removeAllDialog = page.getByRole("alertdialog", { name: "Remove all 2 devices?" });
	await expect(
		removeAllDialog.getByRole("heading", { name: "Remove all 2 devices?" }),
	).toBeFocused();
	await removeAllDialog.getByRole("button", { name: "Cancel" }).click();
	await page.getByRole("button", { name: "Remove all devices" }).click();
	await removeAllDialog.getByRole("button", { name: "Remove all", exact: true }).click();
	await expect(page.getByText("No devices", { exact: true })).toBeVisible();
	await expect(page.locator('[data-flowvy-dust-overlay="true"]')).toHaveCount(0);
	await expect(
		page.getByText("Connect a device with your subscription to see it here"),
	).toBeVisible();
	await assertNoHorizontalOverflow(page);
	expect(accessibilityByTheme.filter(({ violations }) => violations.length > 0)).toEqual([]);
});

test("device details use OS logos and compact provider metadata", async ({ page, mockApi }) => {
	const platforms = ["android", "ios", "macos", "windows", "linux"] as const;
	const devices = platforms.map((platform, index) => ({
		...mockData.devices.devices[0],
		hwid: `device-${index + 1}`,
		platform,
		deviceModel: `${platform} device`,
		osVersion: `DO-NOT-RENDER-${index}`,
		userAgent:
			index === 0
				? "A-very-long-synthetic-client-user-agent/1.0 (compatible; deterministic browser layout regression; no real device data)"
				: null,
		requestIp: index === 0 ? "2001:db8::42" : null,
	}));
	mockApi.mock("GET", "/api/me/devices", {
		body: { devices, total: devices.length, limit: 5 },
	});

	await page.goto("/devices");
	for (const name of ["Android", "iOS", "macOS", "Windows", "Linux"]) {
		await expect(page.getByRole("img", { name })).toBeVisible();
	}
	await expect(page.getByText("DO-NOT-RENDER-0", { exact: true })).toHaveCount(0);
	await expect(
		page.getByText(
			"A-very-long-synthetic-client-user-agent/1.0 (compatible; deterministic browser layout regression; no real device data)",
			{ exact: true },
		),
	).toHaveCount(0);
	await expect(page.getByText("2001:db8::42", { exact: true })).toBeVisible();
	await expect(page.getByText("Not reported", { exact: true })).toHaveCount(4);
	await assertNoHorizontalOverflow(page);
	await assertOnlyExpectedViewportZoomRestriction(page);
});

test("remove-all gives every device its own staggered dust layer", async ({ page, mockApi }) => {
	await page.emulateMedia({ reducedMotion: "no-preference" });
	const twoDevices = {
		devices: [
			mockData.devices.devices[0],
			{
				...mockData.devices.devices[0],
				hwid: "device-2",
				platform: "windows",
				deviceModel: "Workstation",
			},
		],
		total: 2,
		limit: 2,
	};
	mockApi.mock("GET", "/api/me/devices", [
		{ body: twoDevices },
		{ delayMs: 1200, body: { devices: [], total: 0, limit: 2 } },
	]);
	mockApi.mock("DELETE", "/api/me/devices", { status: 204, delayMs: 120 });

	await page.goto("/devices");
	await page.getByRole("button", { name: "Remove all devices" }).click();
	const deleteResponse = page.waitForResponse(
		(response) =>
			response.request().method() === "DELETE" &&
			new URL(response.url()).pathname === "/api/me/devices",
	);
	await page.getByRole("button", { name: "Remove all", exact: true }).click();
	await deleteResponse;

	await expect(page.locator('[data-state="removing"][data-effect="dust"]')).toHaveCount(2, {
		timeout: 400,
	});
	await expect(page.locator('[data-flowvy-dust-overlay="true"]')).toHaveCount(2);
	const dustLayers = page.locator("[data-flowvy-dust-layer]");
	await expect(dustLayers).toHaveCount(24);
	const animatedProperties = await dustLayers.first().evaluate((layer) => {
		const animation = layer.getAnimations()[0];
		return animation?.effect instanceof KeyframeEffect
			? animation.effect.getKeyframes().flatMap((frame) => Object.keys(frame))
			: [];
	});
	expect(animatedProperties).toContain("transform");
	expect(animatedProperties).toContain("opacity");
	expect(animatedProperties).not.toContain("filter");
	await expect(page.getByText("No devices", { exact: true })).toBeVisible({ timeout: 2500 });
	await assertNoHorizontalOverflow(page);
});

test("successful device removal collapses without waiting for the devices refetch", async ({
	page,
	mockApi,
}) => {
	await page.emulateMedia({ reducedMotion: "no-preference" });
	const twoDevices = {
		devices: [
			mockData.devices.devices[0],
			{
				...mockData.devices.devices[0],
				hwid: "device-2",
				platform: "windows",
				deviceModel: "Workstation",
			},
		],
		total: 2,
		limit: 2,
	};
	mockApi.mock("GET", "/api/me/devices", [
		{ body: twoDevices },
		{
			delayMs: 1200,
			body: { devices: [twoDevices.devices[1]], total: 1, limit: 2 },
		},
	]);
	mockApi.mock("DELETE", "/api/me/devices/device-1", { status: 204, delayMs: 120 });

	await page.goto("/devices");
	await page.getByRole("button", { name: "Delete device" }).first().click();
	const deleteResponse = page.waitForResponse(
		(response) =>
			response.request().method() === "DELETE" &&
			new URL(response.url()).pathname === "/api/me/devices/device-1",
	);
	await page.getByRole("button", { name: "Remove", exact: true }).click();
	await deleteResponse;

	const removingDevice = page.locator('[data-state="removing"][data-effect="dust"]');
	await expect(removingDevice).toHaveCount(1, { timeout: 300 });
	await expect(page.locator('[data-flowvy-dust-overlay="true"]')).toHaveCount(1);
	await expect(page.getByText("Pixel 8", { exact: true })).toBeHidden();
	await expect(page.getByText("Pixel 8", { exact: true })).toHaveCount(0, { timeout: 1200 });
	await expect(page.getByText("Workstation", { exact: true })).toBeVisible();
	await expect(page.getByText("1 / 2", { exact: true })).toBeVisible();
	await assertNoHorizontalOverflow(page);
});

test("Pulse renders partial, down, maintenance, incidents, failure, and retry", async ({
	page,
	mockApi,
}) => {
	const pulse = mockData.pulse;
	mockApi.mock("GET", "/api/debug/pulse", [
		{
			body: {
				...pulse,
				overallStatus: "partial",
				incidents: [{ title: "Proxy nodes are degraded", createdAt: "2026-08-01T12:00:00Z" }],
			},
		},
		{ body: { ...pulse, overallStatus: "down" } },
		{ body: { ...pulse, overallStatus: "maintenance" } },
		{ status: 504, body: { detail: "Status provider unavailable" } },
		{ status: 504, body: { detail: "Status provider unavailable" } },
		{ body: pulse },
	]);

	await page.goto("/pulse");
	await expect(page.getByText("Partial system outage")).toBeVisible();
	await expect(page.getByText("Proxy nodes are degraded")).toBeVisible();

	await page.reload();
	await expect(page.getByText("Major outage")).toBeVisible();
	await page.reload();
	await expect(page.getByText("Scheduled maintenance")).toBeVisible();
	await page.reload();
	await expect(page.getByRole("heading", { name: "Unable to load data" })).toBeVisible();
	await page.getByRole("button", { name: "Retry" }).click();
	await expect(page.getByText("All systems operational")).toBeVisible();
	await assertNoHorizontalOverflow(page);
});

test("malformed Pulse success response becomes a recoverable error state", async ({
	page,
	mockApi,
}) => {
	mockApi.mock("GET", "/api/debug/pulse", {
		body: "not-json",
		contentType: "text/plain",
	});
	await page.goto("/pulse");
	await expect(page.getByRole("heading", { name: "Unable to load data" })).toBeVisible();
});

test("page data failures share one retryable error state", async ({ page, mockApi }) => {
	const failure = { status: 502, body: { detail: "Provider unavailable" } };
	mockApi.mock("GET", "/api/me/devices", failure);
	mockApi.mock("GET", "/api/debug/admin/users/all", failure);
	mockApi.mock("GET", "/api/debug/admin/settings", failure);

	for (const path of ["/devices", "/admin/users", "/admin/settings"] as const) {
		await page.goto(path);
		const errorState = page.getByRole("alert");
		await expect(errorState.getByRole("heading", { name: "Unable to load data" })).toBeVisible();
		await expect(errorState).toContainText("Something went wrong. Please try again");
		await expect(errorState.getByRole("button", { name: "Retry" })).toBeVisible();
	}
});

test("dashboard supports full, unavailable, and backend error states", async ({
	page,
	mockApi,
}) => {
	const period = { current: "1.5 TB", previous: "1.0 TB", difference: "+50%" };
	const fullDashboard = {
		...mockData.dashboard,
		remnawaveStats: {
			cpu: { cores: 8 },
			memory: { total: 16 * 1024 ** 3, free: 8 * 1024 ** 3, used: 8 * 1024 ** 3 },
			uptime: 864000,
			users: {
				statusCounts: { ACTIVE: 123456, DISABLED: 2, LIMITED: 3, EXPIRED: 4, UNKNOWN: 5 },
				totalUsers: 123470,
			},
			onlineStats: { onlineNow: 9876, lastDay: 10000, lastWeek: 12000, neverOnline: 10 },
			nodes: { totalOnline: 42, totalBytesLifetime: "999999999999999" },
		},
		remnawaveBandwidth: {
			bandwidthLastTwoDays: period,
			bandwidthLastSevenDays: period,
			bandwidthLast30Days: period,
			bandwidthCalendarMonth: period,
			bandwidthCurrentYear: period,
		},
	};
	mockApi.mock("GET", "/api/debug/admin/dashboard", [
		{ body: fullDashboard },
		{ body: mockData.dashboard },
		{ status: 502, body: { detail: "Unavailable" } },
		{ status: 502, body: { detail: "Unavailable" } },
	]);

	await page.goto("/admin/dashboard");
	await expect(page.getByText("123470")).toBeVisible();
	await expect(page.getByText("Unknown status", { exact: true })).toBeVisible();
	await page.getByRole("tab", { name: "Flowvy Mini-App" }).click();
	await expect(page.getByText("10", { exact: true })).toBeVisible();
	await page.reload();
	await expect(page.getByText("Remnawave unavailable")).toBeVisible();
	await page.reload();
	await expect(page.getByRole("heading", { name: "Unable to load data" })).toBeVisible();
	await assertNoHorizontalOverflow(page);
});

test("unknown Remnawave status is explicit and does not offer a status mutation", async ({
	page,
	mockApi,
}) => {
	const unknownSubscription = { ...mockData.subscription, status: "UNKNOWN" };
	const unknownUser = { ...mockData.adminUser, status: "UNKNOWN" };
	mockApi.mock("GET", "/api/me/subscription", { body: unknownSubscription });
	mockApi.mock("GET", "/api/debug/admin/users/1", { body: unknownUser });

	await page.goto("/");
	await expect(page.getByText("Unknown status", { exact: true })).toBeVisible();
	await assertNoHorizontalOverflow(page);

	await page.goto("/admin/users/1");
	await expect(page.getByText("Unknown status", { exact: true })).toBeVisible();
	await expect(page.getByRole("button", { name: "Enable" })).toHaveCount(0);
	await expect(page.getByRole("button", { name: "Disable" })).toHaveCount(0);
	await expect(page.getByRole("button", { name: "Reset Traffic" })).toBeVisible();
	await assertNoHorizontalOverflow(page);
	const result = await new AxeBuilder({ page }).analyze();
	const serious = result.violations.filter((violation) =>
		["serious", "critical"].includes(violation.impact ?? ""),
	);
	expect(serious).toEqual([]);
});

test("lifetime expiry uses the shared no-expiry presentation in admin detail", async ({
	page,
	mockApi,
}) => {
	const lifetimeUser = {
		...mockData.adminUser,
		expireAt: "2099-12-31T23:59:59Z",
	};
	mockApi.mock("GET", "/api/debug/admin/users/1", { body: lifetimeUser });

	await page.goto("/admin/users/1");
	const noExpiry = page.locator('[data-expiry-tone="unlimited"]');
	await expect(noExpiry).toBeVisible();
	const secondaryText = await page.evaluate(() => {
		const probe = document.createElement("span");
		probe.style.color = "var(--v2-text-secondary)";
		document.body.append(probe);
		const color = getComputedStyle(probe).color;
		probe.remove();
		return color;
	});
	await expect(noExpiry).toHaveCSS("color", secondaryText);
	await expect(page.getByText("No expiry", { exact: true })).toBeVisible();
	await expect(page.getByText("Jan 1, 2100", { exact: true })).toHaveCount(0);
	await assertNoHorizontalOverflow(page);
});

test("users support empty search, missing detail, and failed actions", async ({
	page,
	mockApi,
}) => {
	const users = Array.from({ length: 80 }, (_, index) => ({
		...mockData.adminUser,
		id: index + 1,
		username: index === 0 ? "alice" : `user_${String(index + 1).padStart(3, "0")}`,
		createdAt: index === 0 ? "2026-08-03T00:00:00Z" : "2026-01-01T00:00:00Z",
	}));
	mockApi.mock("GET", "/api/debug/admin/users/all", { body: { users, total: users.length } });

	await page.goto("/admin/users");
	await expect(page.getByText("alice")).toBeVisible();
	await page.getByRole("button", { name: "Search users" }).click();
	await page.getByRole("textbox", { name: "Search users" }).fill("not-present");
	await expect(page.getByText("No users found")).toBeVisible();
	await page.getByRole("button", { name: "Clear search" }).click();
	await expect(page.getByText("alice")).toBeVisible();

	mockApi.mock("GET", "/api/debug/admin/users/missing-user", [
		{ status: 404, body: { detail: "Not found" } },
		{ status: 404, body: { detail: "Not found" } },
	]);
	await page.goto("/admin/users/missing-user");
	await expect(page.getByRole("heading", { name: "User not found" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Back to users" })).toBeVisible();

	mockApi.mock("POST", "/api/debug/admin/users/1/disable", {
		status: 502,
		body: { detail: "Provider unavailable" },
	});
	await page.goto("/admin/users/1");
	await page.getByRole("button", { name: "Disable", exact: true }).click();
	await expect(page.getByRole("dialog", { name: "Disable user?" })).toBeVisible();
	await expect(page.getByRole("dialog")).toContainText("alice will lose proxy access");
	await page.getByRole("button", { name: "Disable", exact: true }).last().click();
	await expect(page.getByRole("alert")).toContainText("The action failed");
	await assertNoHorizontalOverflow(page);
});

test("users are ordered by registration date with newest first", async ({ page, mockApi }) => {
	const users = [
		{
			...mockData.adminUser,
			id: 1,
			username: "older_recently_online",
			createdAt: "2026-01-01T00:00:00Z",
			userTraffic: {
				...mockData.adminUser.userTraffic,
				onlineAt: "2026-08-01T00:00:00Z",
			},
		},
		{
			...mockData.adminUser,
			id: 2,
			username: "newest_offline",
			createdAt: "2026-08-02T00:00:00Z",
			userTraffic: {
				...mockData.adminUser.userTraffic,
				onlineAt: null,
			},
		},
		{
			...mockData.adminUser,
			id: 3,
			username: "newest_tiebreaker",
			createdAt: "2026-08-02T00:00:00Z",
			userTraffic: {
				...mockData.adminUser.userTraffic,
				onlineAt: null,
			},
		},
	];
	mockApi.mock("GET", "/api/debug/admin/users/all", { body: { users, total: users.length } });

	await page.goto("/admin/users");
	await expect(page.getByText("newest_tiebreaker", { exact: true })).toBeVisible();

	const usernames = await page
		.getByRole("list", { name: "Users list" })
		.getByText(/^(newest_tiebreaker|newest_offline|older_recently_online)$/)
		.allTextContents();
	expect(usernames).toEqual(["newest_tiebreaker", "newest_offline", "older_recently_online"]);
	await assertNoHorizontalOverflow(page);
});

test("settings show failed saves and uploads and preserve keyboard focus in discard dialogs", async ({
	page,
	mockApi,
}) => {
	await installTelegramMainButton(page);
	mockApi.mock("PATCH", "/api/debug/admin/settings", {
		status: 500,
		body: { detail: "Save failed" },
	});
	mockApi.mock("POST", "/api/debug/admin/settings/kuma/test", {
		status: 502,
		body: { detail: "Test failed" },
	});

	await page.goto(withTelegramMainButton("/admin/settings"));
	await page.getByRole("button", { name: /^Pulse monitoring/ }).click();
	await page.getByRole("button", { name: /^Uptime Kuma Public status page/ }).click();
	const urlInput = page.getByPlaceholder("https://status.example.com");
	await urlInput.fill("https://new-status.example.test");
	await page.evaluate(() => window.history.back());
	const dialog = page.getByRole("dialog", { name: "Discard changes?" });
	await expect(dialog).toBeVisible();
	await expect(dialog.getByRole("heading", { name: "Discard changes?" })).toBeFocused();
	await expect(page.getByRole("button", { name: "Close" })).not.toBeFocused();
	await page.keyboard.press("Shift+Tab");
	await expect(page.getByRole("button", { name: "Discard" })).toBeFocused();
	await page.keyboard.press("Escape");
	await expect(dialog).toHaveCount(0);
	await expect(urlInput).toBeFocused();

	await page.getByRole("button", { name: "Test" }).click();
	const testError = page.getByRole("alert").filter({ hasText: "Connection test failed" });
	await expect(testError).toBeFocused();
	await pressTelegramMainButton(page);
	const saveError = page
		.getByRole("alert")
		.filter({ hasText: "Could not save changes. Try again" });
	await expect(saveError).toBeFocused();

	mockApi.mock("POST", "/api/debug/admin/settings/welcome-media", [
		{ status: 413, body: { detail: "Too large" } },
		{ body: { fileId: "telegram-file-1", fileName: "welcome.mp4", mediaType: "animation" } },
	]);
	await page.goto(withTelegramMainButton("/admin/settings/welcome"));
	const fileInput = page.locator('input[type="file"]');
	await fileInput.setInputFiles({
		name: "too-large.mp4",
		mimeType: "video/mp4",
		buffer: Buffer.from("x"),
	});
	const uploadError = page.getByRole("alert").filter({ hasText: "Upload failed" });
	await expect(uploadError).toBeFocused();
	await fileInput.setInputFiles({
		name: "welcome.mp4",
		mimeType: "video/mp4",
		buffer: Buffer.from("ok"),
	});
	await expect(page.getByText("welcome.mp4")).toBeVisible();
	await assertNoHorizontalOverflow(page);
});

test("provider business failures use the same focused action error as transport failures", async ({
	page,
	mockApi,
}) => {
	mockApi.mock("POST", "/api/debug/admin/settings/kuma/test", {
		body: { ok: false, error: "private Kuma diagnostic" },
	});
	mockApi.mock("POST", "/api/debug/admin/settings/beszel/test", {
		body: { ok: false, error: "private Beszel diagnostic" },
	});

	for (const [path, label, privateDiagnostic] of [
		["/admin/settings/kuma", "Connection test failed", "private Kuma diagnostic"],
		["/admin/settings/beszel", "Connection test failed", "private Beszel diagnostic"],
	] as const) {
		await page.goto(path);
		await page.getByRole("button", { name: "Test" }).click();
		const error = page.getByRole("alert").filter({ hasText: label });
		await expect(error).toBeFocused();
		await expect(page.getByText(privateDiagnostic)).toHaveCount(0);
		await page.getByRole("button", { name: "Test" }).click();
		await expect(error).toBeFocused();
		await expect(page.getByText(privateDiagnostic)).toHaveCount(0);
	}

	await assertNoHorizontalOverflow(page);
});

test("settings overview exposes and retries a partial registration-settings load failure", async ({
	page,
	mockApi,
}, testInfo) => {
	mockApi.mock("GET", "/api/debug/admin/registration", [
		{ status: 503, body: { detail: "Unavailable" } },
		{ status: 503, body: { detail: "Unavailable" } },
		{
			body: {
				registrationMode: "open",
				defaultAccessProfileId: null,
			},
		},
	]);

	await page.goto("/admin/settings");
	const error = page
		.getByRole("alert")
		.filter({ hasText: "Registration settings are temporarily unavailable" });
	await expect(error).toBeVisible();
	await expect(error).not.toBeFocused();
	if (testInfo.project.name === "mobile-chromium") {
		await page.screenshot({ path: testInfo.outputPath("settings-partial-load-error-dark.png") });
		await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
		await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
		await expect
			.poll(() => error.evaluate((element) => getComputedStyle(element).backgroundColor))
			.toBe("rgb(254, 238, 237)");
		await page.screenshot({ path: testInfo.outputPath("settings-partial-load-error-light.png") });
	}
	await page.getByRole("button", { name: "Retry" }).click();
	await expect(error).toHaveCount(0);
	await expect(page.getByRole("button", { name: /Registration & Access.*Open/ })).toBeVisible();
	await assertNoHorizontalOverflow(page);
});

test("provider identity updates the user experience without a reload", async ({
	page,
	mockApi,
}) => {
	await installTelegramMainButton(page);
	await page.goto(withTelegramMainButton("/admin/settings/branding"));
	await page.getByLabel("App Name").fill("Northstar Proxy");
	await pressTelegramMainButton(page);

	await expect(page).toHaveTitle("Northstar Proxy");
	await page.getByRole("switch", { name: "Admin mode" }).click();
	await page.getByRole("link", { name: "Home" }).click();
	const share = page.getByRole("button", { name: "Share in Telegram" });
	await expect(share).toBeVisible();
	await share.click();
	await expect.poll(() => mockApi.calls).toContain("POST /api/me/invite/prepared-share");
	await assertNoHorizontalOverflow(page);
});

test("Support and Broadcast stay in-app placeholders without external actions", async ({
	page,
	mockApi: _mock,
}) => {
	for (const screen of [
		{ path: "/support", title: "Support", description: "In-app support is coming soon" },
		{ path: "/admin/broadcast", title: "Broadcast", description: "Broadcast is coming soon" },
	]) {
		await page.goto(screen.path);
		const placeholder = page.getByRole("region", { name: screen.title });
		await expect(placeholder.getByText(screen.description)).toBeVisible();
		await expect(placeholder.getByRole("link")).toHaveCount(0);
		await assertNoHorizontalOverflow(page);
	}
});

test("settings select Beszel and verify its server-side read-only connection", async ({
	page,
	mockApi: _mock,
}) => {
	await page.goto("/admin/settings");
	await page.getByRole("button", { name: /^Pulse monitoring/ }).click();
	await expect(page.getByRole("radiogroup", { name: "Pulse source" })).toBeVisible();
	await page.getByRole("radio", { name: "Beszel", exact: true }).click();
	await expect(page.getByText("Active", { exact: true })).toBeVisible();

	await page.getByRole("button", { name: /^Beszel Hub and read-only access/ }).click();
	await expect(page.getByText("Configured on server")).toBeVisible();
	await page.getByRole("button", { name: "Test" }).click();
	await expect(page.getByText("Connected", { exact: true })).toBeVisible();
	await assertNoHorizontalOverflow(page);
});

test("Beszel tests the URL currently entered without saving it", async ({ page, mockApi }) => {
	mockApi.mock("GET", "/api/debug/admin/settings", {
		body: { ...mockData.settings, pulseProvider: "disabled", beszelUrl: null },
	});
	await page.goto("/admin/settings/beszel");
	const url = "https://draft-beszel.example.test";
	await page.getByPlaceholder("https://monitor.example.com").fill(url);
	const requestPromise = page.waitForRequest(
		(request) =>
			request.method() === "POST" &&
			new URL(request.url()).pathname === "/api/debug/admin/settings/beszel/test",
	);
	await page.getByRole("button", { name: "Test" }).click();
	const request = await requestPromise;
	expect(request.postDataJSON()).toEqual({ url });
	await expect(page.getByText("Connected", { exact: true })).toBeVisible();
	expect(mockApi.calls).not.toContain("PATCH /api/debug/admin/settings");
});

test("enabling a configured Beszel source exposes Pulse without reloading", async ({
	page,
	mockApi,
}) => {
	await installTelegramMainButton(page);
	mockApi.seedSettings({ pulseProvider: "disabled", beszelUrl: null });
	await page.goto(withTelegramMainButton("/admin/settings"));
	await page.getByRole("button", { name: /^Pulse monitoring/ }).click();
	await page.evaluate(() => {
		(window as typeof window & { __flowvyDocumentMarker?: string }).__flowvyDocumentMarker =
			"same-document";
	});

	await expect(page.getByRole("radio", { name: "Beszel", exact: true })).toHaveCount(0);
	await page.getByRole("button", { name: /^Beszel Hub and read-only access/ }).click();
	await page.getByPlaceholder("https://monitor.example.com").fill("https://beszel.example.test");
	const settingsReadsBeforeSave = mockApi.calls.filter(
		(call) => call === "GET /api/debug/admin/settings",
	).length;
	await pressTelegramMainButton(page);
	await expect
		.poll(() => mockApi.calls.filter((call) => call === "GET /api/debug/admin/settings").length)
		.toBeGreaterThan(settingsReadsBeforeSave);
	await page.goBack();
	await expect(page).toHaveURL(/\/admin\/settings\/pulse(?:\?|$)/);
	await expect(page.getByRole("dialog", { name: "Discard changes?" })).toHaveCount(0);
	const currentProvider = page.getByRole("radiogroup", { name: "Pulse source" });
	await expect(currentProvider).toBeVisible();
	await currentProvider.getByRole("radio", { name: "Beszel", exact: true }).click();
	await expect(page.getByText("Active", { exact: true })).toBeVisible();

	await page.getByRole("switch", { name: "Admin mode" }).click();
	await expect(page.getByRole("link", { name: "Pulse" })).toBeVisible();
	await page.getByRole("link", { name: "Pulse" }).click();
	await expect(page.getByText("All systems operational")).toBeVisible();
	await expect
		.poll(() =>
			page.evaluate(
				() =>
					(window as typeof window & { __flowvyDocumentMarker?: string }).__flowvyDocumentMarker,
			),
		)
		.toBe("same-document");
});

test("unconfigured Pulse source opens setup without an invalid save", async ({ page, mockApi }) => {
	mockApi.mock("GET", "/api/debug/admin/settings", {
		body: {
			...mockData.settings,
			pulseProvider: "disabled",
			kumaUrl: null,
			kumaSlug: null,
			beszelUrl: null,
		},
	});
	mockApi.mock("PATCH", "/api/debug/admin/settings", {
		status: 422,
		body: { detail: "Beszel URL is required when Pulse uses Beszel" },
	});

	await page.goto("/admin/settings/pulse");
	const provider = page.getByRole("radiogroup", { name: "Pulse source" });
	await expect(provider.getByRole("radio", { name: "Off" })).toBeChecked();
	await expect(provider.getByRole("radio")).toHaveCount(1);
	await expect(provider.getByRole("radio", { name: "Kuma", exact: true })).toHaveCount(0);
	await expect(provider.getByRole("radio", { name: "Beszel", exact: true })).toHaveCount(0);

	await page.getByRole("button", { name: /^Beszel Hub and read-only access/ }).click();
	await expect(page).toHaveURL(/\/admin\/settings\/beszel$/);
	await expect(page.getByRole("heading", { name: "Connection" })).toBeVisible();
	await expect(page.getByText("Could not save changes. Try again")).toHaveCount(0);
});

test("Beszel settings show missing credentials and a recoverable test failure", async ({
	page,
	mockApi,
}) => {
	mockApi.mock("GET", "/api/debug/admin/settings", {
		body: { ...mockData.settings, beszelCredentialsConfigured: false },
	});
	mockApi.mock("POST", "/api/debug/admin/settings/beszel/test", {
		status: 502,
		body: { detail: "Provider unavailable" },
	});

	await page.goto("/admin/settings/beszel");
	await expect(page.getByText("Missing on server")).toBeVisible();
	await page.getByRole("button", { name: "Test" }).click();
	await expect(page.getByRole("alert")).toContainText("Connection test failed");
	await assertNoHorizontalOverflow(page);
});

test("key interactive screens have no serious accessibility violations in both themes", async ({
	page,
	mockApi: _mock,
}) => {
	const accessibilityByContext: Array<{
		theme: "light" | "dark";
		path: string;
		serious: unknown[];
	}> = [];
	for (const colorScheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
		for (const path of [
			"/",
			"/devices",
			"/pulse",
			"/admin/settings",
			"/admin/settings/beszel",
			"/admin/settings/tribute",
		] as const) {
			await page.goto(path);
			await page.evaluate((theme) => {
				document.documentElement.setAttribute("data-theme", theme);
			}, colorScheme);
			await expect(page.getByRole("main").locator(":scope > div")).toHaveCSS("opacity", "1");
			const result = await new AxeBuilder({ page }).analyze();
			accessibilityByContext.push({
				theme: colorScheme,
				path,
				serious: result.violations.filter((violation) =>
					["serious", "critical"].includes(violation.impact ?? ""),
				),
			});
			await assertNoHorizontalOverflow(page);
		}
	}
	expect(accessibilityByContext.filter(({ serious }) => serious.length > 0)).toEqual([]);
});
