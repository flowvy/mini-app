import { assertNoHorizontalOverflow, expect, mockData, test } from "./fixtures/mock-api.ts";

const screens = [
	{ name: "home", path: "/", marker: "Account Info" },
	{ name: "devices", path: "/devices", marker: "Pixel 8" },
	{ name: "pulse", path: "/pulse", marker: "All systems operational" },
	{ name: "support", path: "/support", marker: "In-app support is coming soon." },
	{ name: "admin-dashboard", path: "/admin/dashboard", marker: "Remnawave unavailable" },
	{ name: "admin-users", path: "/admin/users", marker: "alice" },
	{ name: "admin-user-detail", path: "/admin/users/1", marker: "alice" },
	{ name: "admin-broadcast", path: "/admin/broadcast", marker: "Coming soon" },
	{ name: "admin-settings", path: "/admin/settings", marker: "Integrations" },
	{ name: "admin-access", path: "/admin/settings/access", marker: "Service mode" },
	{ name: "admin-settings-kuma", path: "/admin/settings/kuma", marker: "URL" },
	{ name: "admin-settings-beszel", path: "/admin/settings/beszel", marker: "Hub URL" },
	{ name: "admin-settings-branding", path: "/admin/settings/branding", marker: "App Name" },
	{ name: "admin-settings-welcome", path: "/admin/settings/welcome", marker: "Message" },
] as const;

test("capture invite-only onboarding", async ({ page, mockApi }, testInfo) => {
	await page.addInitScript(() => localStorage.setItem("flowvy:mock-auth", "onboarding"));
	mockApi.mock("GET", "/api/me", {
		status: 403,
		body: { detail: { code: "invite_required", message: "An invite code is required" } },
	});
	mockApi.mock("GET", "/api/onboarding", {
		body: {
			state: "invite_required",
			registrationMode: "invite_only",
			appName: "Flowvy",
			logoUrl: null,
			launchInviteAvailable: false,
		},
	});

	await page.goto("/");
	await expect(page.getByRole("heading", { name: "Invitation required" })).toBeVisible();
	await assertNoHorizontalOverflow(page);
	await page.screenshot({
		path: testInfo.outputPath("invite-onboarding.png"),
		animations: "disabled",
	});
});

test("capture unavailable Telegram referral in light and dark themes", async ({
	page,
	mockApi,
}, testInfo) => {
	mockApi.mock("GET", "/api/me/invite", {
		body: {
			code: "FVY-2345-6789-ABCD-EFGH-JKMN",
			invitedCount: 3,
			referralUrl: null,
			referralStatus: "main_app_not_configured",
		},
	});

	for (const colorScheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
		await page.goto("/");
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		await expect(page.getByText(/Telegram invite link is not configured yet/)).toBeVisible();
		await expect(page.getByRole("link", { name: "Share in Telegram" })).toHaveCount(0);
		await assertNoHorizontalOverflow(page);
		await page.screenshot({
			path: testInfo.outputPath(`home-referral-unavailable-${colorScheme}.png`),
			animations: "disabled",
		});
	}
});

test("capture the unified Home loading state", async ({ page, mockApi }, testInfo) => {
	mockApi.mock("GET", "/api/me/subscription", {
		status: 404,
		body: { detail: "No subscription" },
		delayMs: 1_000,
	});

	await page.goto("/");
	await expect(page.getByLabel("Loading invite")).toBeVisible();
	await expect(page.getByText("Invite friends", { exact: true })).not.toBeVisible();
	await assertNoHorizontalOverflow(page);
	await page.screenshot({
		path: testInfo.outputPath("home-unified-loading.png"),
		animations: "disabled",
	});
});

test("capture deterministic visual evidence for key screens", async ({
	page,
	mockApi: _mock,
}, testInfo) => {
	test.setTimeout(120_000);
	for (const colorScheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
		for (const screen of screens) {
			await page.goto(screen.path);
			await page.evaluate((theme) => {
				document.documentElement.setAttribute("data-theme", theme);
			}, colorScheme);
			await expect(page.getByText(screen.marker, { exact: true }).first()).toBeVisible();
			await assertNoHorizontalOverflow(page);
			await page.screenshot({
				path: testInfo.outputPath(`${screen.name}-${colorScheme}.png`),
				animations: "disabled",
			});
		}
	}
});

test("capture unknown status fallback in light and dark themes", async ({
	page,
	mockApi,
}, testInfo) => {
	mockApi.mock("GET", "/api/me/subscription", {
		body: { ...mockData.subscription, status: "UNKNOWN" },
	});
	mockApi.mock("GET", "/api/debug/admin/users/1", {
		body: { ...mockData.adminUser, status: "UNKNOWN" },
	});

	for (const colorScheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
		await page.goto("/");
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		await expect(page.getByText("Unknown status", { exact: true })).toBeVisible();
		await assertNoHorizontalOverflow(page);
		await page.screenshot({
			path: testInfo.outputPath(`home-unknown-status-${colorScheme}.png`),
			animations: "disabled",
		});

		await page.goto("/admin/users/1");
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		await expect(page.getByText("Unknown status", { exact: true })).toBeVisible();
		await expect(page.getByRole("button", { name: "Enable" })).toHaveCount(0);
		await expect(page.getByRole("button", { name: "Disable" })).toHaveCount(0);
		await assertNoHorizontalOverflow(page);
		await page.screenshot({
			path: testInfo.outputPath(`admin-user-unknown-status-${colorScheme}.png`),
			animations: "disabled",
		});
	}
});

test("capture Beszel settings in light and dark themes", async ({
	page,
	mockApi: _mock,
}, testInfo) => {
	for (const colorScheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
		await page.goto("/admin/settings/beszel");
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		await expect(page.getByText("Hub URL", { exact: true })).toBeVisible();
		await assertNoHorizontalOverflow(page);
		await page.screenshot({
			path: testInfo.outputPath(`admin-settings-beszel-${colorScheme}.png`),
			animations: "disabled",
		});
	}
});

test("capture the lifetime access editor in light and dark themes", async ({
	page,
	mockApi: _mock,
}, testInfo) => {
	for (const colorScheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
		await page.goto("/admin/settings/access");
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		await expect(
			page
				.getByLabel("Default access")
				.locator("..")
				.locator("span", { hasText: "No proxy access" }),
		).toBeVisible();
		await page.getByLabel("Default access").focus();
		await page.screenshot({
			path: testInfo.outputPath(`admin-access-policy-${colorScheme}.png`),
			animations: "disabled",
		});
		await page.getByRole("button", { name: /Add/ }).click();
		const daysRestingValue = page.getByLabel("Number of days").locator("..").getByText("30");
		const touchInput = await page.evaluate(
			() => window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0,
		);
		if (touchInput) {
			await expect(daysRestingValue).toBeVisible();
		} else {
			await expect(daysRestingValue).not.toBeVisible();
		}
		await assertNoHorizontalOverflow(page);
		await page.screenshot({
			path: testInfo.outputPath(`admin-access-days-${colorScheme}.png`),
			animations: "disabled",
		});
		await page.getByRole("button", { name: "No expiry" }).click();
		await page.getByText("Advanced Remnawave fields").click();
		await expect(page.getByLabel("Remnawave tag")).toBeEnabled();
		await assertNoHorizontalOverflow(page);
		await page.screenshot({
			path: testInfo.outputPath(`admin-access-lifetime-${colorScheme}.png`),
			animations: "disabled",
		});
		await page.getByRole("button", { name: "Date" }).click();
		const dateInput = page.getByRole("textbox", { name: "Expires at" });
		await expect(dateInput).toBeVisible();
		await expect(page.getByText("Every new user receives access until this date.")).toHaveCount(0);
		await expect
			.poll(() => dateInput.evaluate((element) => getComputedStyle(element).colorScheme))
			.toContain(colorScheme);
		const editor = page.getByRole("form", { name: "New access profile" });
		const [editorBox, dateBox] = await Promise.all([editor.boundingBox(), dateInput.boundingBox()]);
		expect(editorBox).not.toBeNull();
		expect(dateBox).not.toBeNull();
		expect((dateBox?.x ?? 0) + (dateBox?.width ?? 0)).toBeLessThanOrEqual(
			(editorBox?.x ?? 0) + (editorBox?.width ?? 0),
		);
		await page.screenshot({
			path: testInfo.outputPath(`admin-access-date-${colorScheme}.png`),
			animations: "disabled",
		});
	}
});

test("capture access editor focus with keyboard-aware bottom chrome", async ({
	page,
	mockApi: _mock,
}, testInfo) => {
	await page.goto("/admin/settings/access");
	await page.getByRole("button", { name: "Add" }).click();
	await page.getByLabel("Name").focus();
	const touchInput = await page.evaluate(
		() => window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0,
	);
	const navigation = page.getByRole("navigation", { includeHidden: true });
	if (touchInput) {
		await expect(navigation).toHaveAttribute("aria-hidden", "true");
	} else {
		await expect(navigation).not.toHaveAttribute("aria-hidden", "true");
	}
	await assertNoHorizontalOverflow(page);
	await page.screenshot({
		path: testInfo.outputPath("admin-access-focused.png"),
		animations: "disabled",
	});
});

test("capture the unconfigured Pulse source selector", async ({ page, mockApi }, testInfo) => {
	mockApi.mock("GET", "/api/debug/admin/settings", {
		body: {
			...mockData.settings,
			pulseProvider: "disabled",
			kumaUrl: null,
			kumaSlug: null,
			beszelUrl: null,
		},
	});

	await page.goto("/admin/settings");
	await expect(page.getByRole("group", { name: "Pulse source" })).toBeVisible();
	await assertNoHorizontalOverflow(page);
	await page.screenshot({
		path: testInfo.outputPath("admin-settings-unconfigured.png"),
		animations: "disabled",
	});
});

test("capture the shared load error state in light and dark themes", async ({
	page,
	mockApi,
}, testInfo) => {
	mockApi.mock("GET", "/api/me/devices", {
		status: 502,
		body: { detail: "Provider unavailable" },
	});

	for (const colorScheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
		await page.goto("/devices");
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		await expect(page.getByRole("heading", { name: "Unable to load data" })).toBeVisible();
		await assertNoHorizontalOverflow(page);
		await page.screenshot({
			path: testInfo.outputPath(`load-error-${colorScheme}.png`),
			animations: "disabled",
		});
	}
});

test("capture the in-app support placeholder in light and dark themes", async ({
	page,
	mockApi: _mock,
}, testInfo) => {
	for (const colorScheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
		await page.goto("/support");
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		await expect(page.getByRole("heading", { name: "Support" })).toBeVisible();
		await expect(page.getByText("In-app support is coming soon.")).toBeVisible();
		await assertNoHorizontalOverflow(page);
		await page.screenshot({
			path: testInfo.outputPath(`support-placeholder-${colorScheme}.png`),
			animations: "disabled",
		});
	}
});

test("capture provider identity settings in light and dark themes", async ({
	page,
	mockApi: _mock,
}, testInfo) => {
	for (const colorScheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
		await page.goto("/admin/settings/branding");
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		await expect(page.getByLabel("App Name")).toBeVisible();
		await expect(page.getByLabel("Logo URL")).toBeVisible();
		await expect(page.getByText("Support URL", { exact: true })).toHaveCount(0);
		await assertNoHorizontalOverflow(page);
		await page.screenshot({
			path: testInfo.outputPath(`admin-identity-${colorScheme}.png`),
			animations: "disabled",
		});
	}
});
