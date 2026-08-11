import AxeBuilder from "@axe-core/playwright";
import { assertNoHorizontalOverflow, expect, mockData, test } from "./fixtures/mock-api.ts";

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
		"Authentication could not be completed. Reopen the Mini App or try again.",
	);

	await page.evaluate(() => localStorage.removeItem("flowvy:mock-auth"));
	await page.getByRole("button", { name: "Retry" }).click();
	await expect(page.getByText("Account Info")).toBeVisible();

	await page.evaluate(() => localStorage.setItem("flowvy:mock-role", "user"));
	await page.reload();
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
		"This account is disabled. Contact support if you think this is a mistake.",
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
	await expect(page.locator('[class*="skeletonHero"]').first()).toBeVisible();
	await expect(page.getByText("Account Info")).toBeVisible();
	await expect(page.getByText("Active", { exact: true })).toBeVisible();

	await page.reload();
	await expect(page.getByText("No active subscription")).toBeVisible();

	await page.reload();
	await expect(page.getByRole("heading", { name: "Unable to load data" })).toBeVisible();
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
	await page.getByRole("button", { name: "Delete device" }).first().click();
	await page.getByRole("button", { name: "Cancel" }).click();
	await expect(page.getByRole("button", { name: "Delete device" }).first()).toBeVisible();

	await page.getByRole("button", { name: "Delete device" }).first().click();
	await page.getByRole("button", { name: "Remove", exact: true }).first().click();
	await expect(page.getByRole("alert")).toContainText("Could not remove the device");
	await expect(page.getByRole("button", { name: "Cancel" }).first()).toBeVisible();

	await page.getByRole("button", { name: "Cancel" }).first().click();
	await page.getByRole("button", { name: "Remove all devices" }).click();
	await page.getByRole("button", { name: "Cancel" }).click();
	await page.getByRole("button", { name: "Remove all devices" }).click();
	await page.getByRole("button", { name: "Remove", exact: true }).click();
	await expect(page.getByText("No devices", { exact: true })).toBeVisible();
	await expect(
		page.getByText("Connect a device with your subscription to see it here"),
	).toBeVisible();
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
		await expect(errorState).toContainText("Something went wrong. Please try again.");
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
	await page.getByRole("button", { name: "Flowvy Mini-App" }).click();
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

test("users support empty search, missing detail, and failed actions", async ({
	page,
	mockApi,
}) => {
	const users = Array.from({ length: 80 }, (_, index) => ({
		...mockData.adminUser,
		id: index + 1,
		username: index === 0 ? "alice" : `user_${String(index + 1).padStart(3, "0")}`,
	}));
	mockApi.mock("GET", "/api/debug/admin/users/all", { body: { users, total: users.length } });

	await page.goto("/admin/users");
	await expect(page.getByText("alice")).toBeVisible();
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
	await expect(page.getByRole("dialog")).toContainText("alice will lose proxy access.");
	await page.getByRole("button", { name: "Disable", exact: true }).last().click();
	await expect(page.getByRole("alert")).toContainText("The action failed");
	await assertNoHorizontalOverflow(page);
});

test("settings show failed saves and uploads and preserve keyboard focus in discard dialogs", async ({
	page,
	mockApi,
}) => {
	mockApi.mock("PATCH", "/api/debug/admin/settings", {
		status: 500,
		body: { detail: "Save failed" },
	});
	mockApi.mock("POST", "/api/debug/admin/settings/kuma/test", {
		status: 502,
		body: { detail: "Test failed" },
	});

	await page.goto("/admin/settings");
	await page.getByRole("button", { name: /^Uptime Kuma Public status page/ }).click();
	const urlInput = page.getByPlaceholder("https://status.example.com");
	await urlInput.fill("https://new-status.example.test");
	await page.evaluate(() => window.history.back());
	const dialog = page.getByRole("dialog", { name: "Discard changes?" });
	await expect(dialog).toBeVisible();
	await expect(page.getByRole("button", { name: "Close" })).toBeFocused();
	await page.keyboard.press("Shift+Tab");
	await expect(page.getByRole("button", { name: "Discard" })).toBeFocused();
	await page.keyboard.press("Escape");
	await expect(dialog).toHaveCount(0);
	await expect(urlInput).toBeFocused();

	await page.getByRole("button", { name: "Test" }).click();
	await expect(page.getByRole("alert")).toContainText("Connection test failed");
	await page.getByRole("button", { name: "Save" }).click();
	await expect(page.getByText("Could not save changes. Try again.")).toBeVisible();

	mockApi.mock("POST", "/api/debug/admin/settings/welcome-media", [
		{ status: 413, body: { detail: "Too large" } },
		{ body: { fileId: "telegram-file-1", fileName: "welcome.mp4", mediaType: "animation" } },
	]);
	await page.goto("/admin/settings/welcome");
	const fileInput = page.locator('input[type="file"]');
	await fileInput.setInputFiles({
		name: "too-large.mp4",
		mimeType: "video/mp4",
		buffer: Buffer.from("x"),
	});
	await expect(page.getByRole("alert")).toContainText("Upload failed");
	await fileInput.setInputFiles({
		name: "welcome.mp4",
		mimeType: "video/mp4",
		buffer: Buffer.from("ok"),
	});
	await expect(page.getByText("welcome.mp4")).toBeVisible();
	await assertNoHorizontalOverflow(page);
});

test("provider identity updates the user experience without a reload", async ({
	page,
	mockApi: _mock,
}) => {
	await page.goto("/admin/settings/branding");
	await page.getByLabel("App Name").fill("Northstar Proxy");
	await page.getByRole("button", { name: "Save" }).click();

	await expect(page).toHaveTitle("Northstar Proxy");
	await page.getByRole("button", { name: "User mode" }).click();
	await page.getByRole("link", { name: "Home" }).click();
	const share = page.getByRole("link", { name: "Share in Telegram" });
	const shareUrl = new URL((await share.getAttribute("href")) ?? "");
	expect(shareUrl.searchParams.get("text")).toContain("Join me on Northstar Proxy.");
	await assertNoHorizontalOverflow(page);
});

test("support stays an in-app feature placeholder without an external action", async ({
	page,
	mockApi: _mock,
}) => {
	await page.goto("/support");
	const support = page.getByRole("region", { name: "Support" });
	await expect(support.getByText("In-app support is coming soon.")).toBeVisible();
	await expect(support.getByRole("link")).toHaveCount(0);
	await assertNoHorizontalOverflow(page);
});

test("settings select Beszel and verify its server-side read-only connection", async ({
	page,
	mockApi: _mock,
}) => {
	await page.goto("/admin/settings");
	await expect(page.getByText("Pulse source")).toBeVisible();
	await page.getByRole("button", { name: "Beszel", exact: true }).click();
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
	mockApi.seedSettings({ pulseProvider: "disabled", beszelUrl: null });
	await page.goto("/admin/settings");
	await page.evaluate(() => {
		(window as typeof window & { __flowvyDocumentMarker?: string }).__flowvyDocumentMarker =
			"same-document";
	});

	const provider = page.getByRole("group", { name: "Pulse source" });
	await provider.getByRole("button", { name: "Beszel", exact: true }).click();
	await page.getByPlaceholder("https://monitor.example.com").fill("https://beszel.example.test");
	const settingsReadsBeforeSave = mockApi.calls.filter(
		(call) => call === "GET /api/debug/admin/settings",
	).length;
	await page.getByRole("button", { name: "Save" }).click();
	await expect
		.poll(() => mockApi.calls.filter((call) => call === "GET /api/debug/admin/settings").length)
		.toBeGreaterThan(settingsReadsBeforeSave);
	await page.goBack();
	await expect(page).toHaveURL(/\/admin\/settings$/);
	await expect(page.getByRole("dialog", { name: "Discard changes?" })).toHaveCount(0);
	const currentProvider = page.getByRole("group", { name: "Pulse source" });
	await expect(currentProvider).toBeVisible();
	await currentProvider.getByRole("button", { name: "Beszel", exact: true }).click();
	await expect(page.getByText("Active", { exact: true })).toBeVisible();

	await page.getByRole("button", { name: "User mode" }).click();
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

	await page.goto("/admin/settings");
	const provider = page.getByRole("group", { name: "Pulse source" });
	await expect(provider.getByRole("button", { name: "Off" })).toHaveAttribute(
		"aria-pressed",
		"true",
	);
	for (const label of ["Off", "Kuma", "Beszel"]) {
		const bounds = await provider.getByRole("button", { name: label, exact: true }).boundingBox();
		expect(bounds?.width ?? 0).toBeGreaterThan(60);
	}

	await provider.getByRole("button", { name: "Beszel", exact: true }).click();
	await expect(page).toHaveURL(/\/admin\/settings\/beszel$/);
	await expect(page.getByRole("heading", { name: "Connection" })).toBeVisible();
	await expect(page.getByText("Could not save changes. Try again.")).toHaveCount(0);
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

test("key interactive screens have no serious accessibility violations in light mode", async ({
	page,
	mockApi: _mock,
}) => {
	await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
	for (const path of [
		"/",
		"/devices",
		"/pulse",
		"/admin/settings",
		"/admin/settings/beszel",
	] as const) {
		await page.goto(path);
		await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
		const result = await new AxeBuilder({ page }).analyze();
		const serious = result.violations.filter((violation) =>
			["serious", "critical"].includes(violation.impact ?? ""),
		);
		expect(serious, `${path} must not have serious accessibility violations`).toEqual([]);
		await assertNoHorizontalOverflow(page);
	}
});
