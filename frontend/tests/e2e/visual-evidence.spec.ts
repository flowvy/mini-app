import {
	assertNoHorizontalOverflow,
	entitlementOperation,
	expect,
	mockData,
	test,
} from "./fixtures/mock-api.ts";

const screens = [
	{ name: "home", path: "/", marker: "Account Info" },
	{ name: "devices", path: "/devices", marker: "Pixel 8" },
	{ name: "pulse", path: "/pulse", marker: "All systems operational" },
	{ name: "support", path: "/support", marker: "In-app support is coming soon" },
	{ name: "admin-dashboard", path: "/admin/dashboard", marker: "Remnawave unavailable" },
	{ name: "admin-users", path: "/admin/users", marker: "alice" },
	{ name: "admin-users-search", path: "/admin/users/search", marker: "alice" },
	{ name: "admin-user-detail", path: "/admin/users/1", marker: "alice" },
	{ name: "admin-broadcast", path: "/admin/broadcast", marker: "Coming soon" },
	{ name: "admin-settings", path: "/admin/settings", marker: "Integrations" },
	{ name: "admin-access", path: "/admin/settings/access", marker: "Service mode" },
	{ name: "admin-settings-kuma", path: "/admin/settings/kuma", marker: "URL" },
	{ name: "admin-settings-beszel", path: "/admin/settings/beszel", marker: "Hub URL" },
	{ name: "admin-settings-tribute", path: "/admin/settings/tribute", marker: "API key" },
	{ name: "admin-settings-branding", path: "/admin/settings/branding", marker: "App name" },
	{ name: "admin-settings-welcome", path: "/admin/settings/welcome", marker: "Content" },
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

test("capture primary, focused-search, and nested navigation surfaces", async ({
	page,
	mockApi: _mock,
}, testInfo) => {
	for (const colorScheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
		await page.goto("/admin/users");
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		await expect(page.getByRole("navigation")).toBeVisible();
		await page.screenshot({
			path: testInfo.outputPath(`tab-navigation-primary-${colorScheme}.png`),
			animations: "disabled",
		});

		await page.getByRole("button", { name: "Search users" }).click();
		await expect(page.getByRole("navigation")).toHaveCount(0);
		await expect(page.getByRole("textbox", { name: "Search users" })).toBeFocused();
		await expect(page.getByText("alice", { exact: true })).toBeInViewport();
		await page.screenshot({
			path: testInfo.outputPath(`tab-navigation-search-${colorScheme}.png`),
			animations: "disabled",
		});

		await page.goto("/admin/settings/kuma");
		await page.getByLabel("URL").focus();
		await expect(page.getByRole("navigation")).toHaveCount(0);
		await page.screenshot({
			path: testInfo.outputPath(`tab-navigation-nested-${colorScheme}.png`),
			animations: "disabled",
		});
	}
});

test("capture compact device metadata in light and dark themes", async ({
	page,
	mockApi: _mock,
}, testInfo) => {
	for (const colorScheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
		await page.goto("/devices");
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		await expect(page.getByRole("img", { name: "Android" })).toBeVisible();
		await expect(page.getByText("Happ/3.11.1 (Android; Pixel 8)", { exact: true })).toHaveCount(0);
		await expect(page.getByText("192.0.2.42", { exact: true })).toBeVisible();
		await assertNoHorizontalOverflow(page);
		await page.screenshot({
			path: testInfo.outputPath(`device-details-${colorScheme}.png`),
			animations: "disabled",
		});

		await page.getByRole("button", { name: "Delete device" }).click();
		const dialog = page.getByRole("alertdialog", { name: "Remove device?" });
		await expect(dialog).toBeVisible();
		await expect(dialog.getByRole("heading", { name: "Remove device?" })).toBeFocused();
		await assertNoHorizontalOverflow(page);
		await page.screenshot({
			path: testInfo.outputPath(`device-remove-confirmation-${colorScheme}.png`),
			animations: "disabled",
		});
		await dialog.getByRole("button", { name: "Cancel" }).click();
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

test("capture Tribute settings in configured and setup states", async ({
	page,
	mockApi,
}, testInfo) => {
	for (const colorScheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
		await page.goto("/admin/settings");
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		await expect(page.getByRole("heading", { name: "Payments" })).toBeVisible();
		await assertNoHorizontalOverflow(page);
		await page.screenshot({
			path: testInfo.outputPath(`admin-settings-payments-${colorScheme}.png`),
			animations: "disabled",
		});
		await page.goto("/admin/settings/tribute");
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		await expect(page.getByText("Configured on server", { exact: true })).toBeVisible();
		await expect(page.getByRole("heading", { name: "Webhook delivery" })).toHaveCount(0);
		await expect(page.getByRole("heading", { name: "Payment activity" })).toBeVisible();
		await assertNoHorizontalOverflow(page);
		await page.screenshot({
			path: testInfo.outputPath(`admin-settings-tribute-${colorScheme}.png`),
			animations: "disabled",
		});
	}

	mockApi.seedSettings({ tributeCredentialsConfigured: false });
	await page.goto("/admin/settings/tribute");
	await expect(page.getByText("Missing on server", { exact: true })).toBeVisible();
	await assertNoHorizontalOverflow(page);
	await page.screenshot({
		path: testInfo.outputPath("admin-settings-tribute-setup.png"),
		animations: "disabled",
	});
});

test("capture Tribute operator review actions and safe resolution dialog", async ({
	page,
	mockApi,
}, testInfo) => {
	const reviewOperation = entitlementOperation({
		status: "review",
		reasonCode: "provider_unavailable",
		availableActions: ["retry", "resolve"],
	});
	const resolvedOperation = entitlementOperation({
		...reviewOperation,
		status: "resolved",
		reasonCode: "operator_resolved",
		availableActions: [],
		lastAction: {
			action: "resolve",
			note: "Verified in Tribute",
			createdAt: "2026-08-14T10:05:00Z",
		},
	});
	const operationReplies = Array.from({ length: 6 }, () => [
		{ body: { operations: [reviewOperation], hasMore: false } },
		{ body: { operations: [resolvedOperation], hasMore: false } },
	]).flat();
	mockApi.mock("GET", "/api/debug/admin/commerce/operations", operationReplies);
	mockApi.mock("POST", /\/api\/debug\/admin\/commerce\/operations\/[^/]+\/actions$/, {
		body: resolvedOperation,
	});

	for (const viewport of [
		{ name: "small-mobile", width: 320, height: 568 },
		{ name: "mobile", width: 430, height: 932 },
		{ name: "desktop", width: 1280, height: 900 },
	] as const) {
		for (const colorScheme of ["light", "dark"] as const) {
			await page.setViewportSize(viewport);
			await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
			await page.goto("/admin/settings/tribute");
			await page.evaluate((theme) => {
				document.documentElement.setAttribute("data-theme", theme);
			}, colorScheme);
			const retryButton = page.getByRole("button", { name: "Retry", exact: true });
			const resolveButton = page.getByRole("button", { name: "Resolve", exact: true });
			await expect(retryButton).toBeVisible();
			await expect(resolveButton).toBeVisible();
			await resolveButton.evaluate((element) => element.scrollIntoView({ block: "center" }));
			await assertNoHorizontalOverflow(page);
			await page.screenshot({
				path: testInfo.outputPath(
					`admin-settings-tribute-review-${viewport.name}-${colorScheme}.png`,
				),
				animations: "disabled",
			});

			await resolveButton.click();
			const resolutionDialog = page.getByRole("dialog", {
				name: "Resolve without changing access?",
			});
			await expect(resolutionDialog).toBeVisible();
			await assertNoHorizontalOverflow(page);
			await page.screenshot({
				path: testInfo.outputPath(
					`admin-settings-tribute-resolve-${viewport.name}-${colorScheme}.png`,
				),
				animations: "disabled",
			});
			const resolutionNote = page.getByLabel("Resolution note");
			await resolutionNote.fill("Verified in Tribute");
			await resolutionNote.focus();
			await resolutionDialog.getByRole("button", { name: "Resolve", exact: true }).click();
			const resolvedEntry = page.getByRole("article").filter({ hasText: "Resolved" });
			await expect(resolutionDialog).toHaveCount(0);
			await expect(resolvedEntry).toBeFocused();
			await page.screenshot({
				path: testInfo.outputPath(
					`admin-settings-tribute-resolved-${viewport.name}-${colorScheme}.png`,
				),
				animations: "disabled",
			});
		}
	}
});

test("capture the flexible Tribute donation rule editor", async ({ page, mockApi }, testInfo) => {
	for (const colorScheme of ["light", "dark"] as const) {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
		await page.goto("/admin/settings/tribute");
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		await page.getByRole("button", { name: "Create first rule" }).click();
		await page.getByLabel("Rule name").fill("Donation access");
		await page.getByLabel("Starts at").fill("500");
		await page.getByLabel("Payment unit").fill("500");
		await page.getByLabel("Access per unit").fill("30");
		await page.getByRole("button", { name: "Add band" }).click();
		await page.getByLabel("Starts at").nth(1).fill("3500");
		await page.getByLabel("Payment unit").nth(1).fill("3500");
		await page.getByLabel("Access per unit").nth(1).fill("365");
		const ruleDialog = page.getByRole("dialog", { name: "Create automation rule" });
		const focusedCurrency = page.getByLabel("Currency");
		await focusedCurrency.focus();
		await expect(ruleDialog.locator("footer")).not.toHaveAttribute("aria-hidden", "true");
		await expect(ruleDialog.locator("footer")).toBeVisible();
		await page.screenshot({
			path: testInfo.outputPath(`admin-settings-tribute-rule-focused-${colorScheme}.png`),
			animations: "disabled",
		});
		await focusedCurrency.blur();
		await page.getByLabel("Payment amount (RUB)").fill("4000");
		mockApi.mock("POST", "/api/debug/admin/commerce/preview", {
			delayMs: 1_000,
			body: {
				matched: true,
				durationDays: 417,
				matchedBand: {
					fromAmountMinor: 350_000,
					unitAmountMinor: 350_000,
					unitDays: 365,
				},
			},
		});
		const previewButton = page.getByRole("button", { name: "Preview", exact: true });
		await previewButton.click();
		await expect(previewButton).toHaveAttribute("aria-busy", "true");
		await page.screenshot({
			path: testInfo.outputPath(`admin-settings-tribute-rule-loading-${colorScheme}.png`),
			animations: "disabled",
		});
		await previewButton.screenshot({
			path: testInfo.outputPath(`admin-settings-tribute-spinner-${colorScheme}.png`),
			animations: "disabled",
		});
		await expect(page.getByText("417 access days", { exact: true })).toBeVisible();
		await assertNoHorizontalOverflow(page);
		const body = page.getByRole("dialog", { name: "Create automation rule" }).locator("form > div");
		await page.evaluate(() => {
			if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
		});
		await body.evaluate((element) => {
			element.scrollTop = 0;
		});
		await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBe(0);
		await page.screenshot({
			path: testInfo.outputPath(`admin-settings-tribute-rule-top-${colorScheme}.png`),
			animations: "disabled",
		});
		await body.evaluate((element) => {
			element.scrollTop = element.scrollHeight;
		});
		await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
		await page.screenshot({
			path: testInfo.outputPath(`admin-settings-tribute-rule-outcome-${colorScheme}.png`),
			animations: "disabled",
		});
	}

	mockApi.mock("POST", "/api/debug/admin/commerce/preview", {
		status: 401,
		body: { detail: "private authentication diagnostic" },
	});
	await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
	await page.goto("/admin/settings/tribute");
	await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
	await page.getByRole("button", { name: "Create first rule" }).click();
	await page.getByLabel("Rule name").fill("Donation access");
	await page.getByLabel("Starts at").fill("500");
	await page.getByLabel("Payment unit").fill("3499");
	await page.getByLabel("Access per unit").fill("30");
	await page.getByLabel("Payment amount (RUB)").fill("500");
	await page.getByRole("button", { name: "Preview", exact: true }).click();
	await expect(page.getByRole("alert")).toContainText("Telegram session expired");
	const errorBody = page
		.getByRole("dialog", { name: "Create automation rule" })
		.locator("form > div");
	await errorBody.evaluate((element) => {
		element.scrollTop = element.scrollHeight;
	});
	await assertNoHorizontalOverflow(page);
	await page.screenshot({
		path: testInfo.outputPath("admin-settings-tribute-preview-session-error-dark.png"),
		animations: "disabled",
	});
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
		await page.getByRole("button", { name: "Create profile" }).click();
		await expect(page.getByLabel("Number of days")).toHaveValue("30");
		await assertNoHorizontalOverflow(page);
		await page.screenshot({
			path: testInfo.outputPath(`admin-access-days-${colorScheme}.png`),
			animations: "disabled",
		});
		await page.getByRole("radio", { name: "No expiry" }).click();
		await page.getByText("Advanced Remnawave fields").focus();
		await page.keyboard.press("Enter");
		await expect(page.getByLabel("Remnawave tag")).toBeEnabled();
		await assertNoHorizontalOverflow(page);
		await page.screenshot({
			path: testInfo.outputPath(`admin-access-lifetime-${colorScheme}.png`),
			animations: "disabled",
		});
		await page.getByRole("radio", { name: "Automation" }).click();
		await expect(
			page.getByText(/No duration or date is stored.*automation must provide the expiry/),
		).toBeVisible();
		await expect(page.getByLabel("Number of days")).toHaveCount(0);
		await expect(page.getByRole("textbox", { name: "Expires at" })).toHaveCount(0);
		await assertNoHorizontalOverflow(page);
		await page.screenshot({
			path: testInfo.outputPath(`admin-access-automation-${colorScheme}.png`),
			animations: "disabled",
		});
		await page.getByRole("radio", { name: "Date" }).click();
		const dateInput = page.getByRole("textbox", { name: "Expires at" });
		await expect(dateInput).toBeVisible();
		await expect(page.getByText("Every new user receives access until this date.")).toHaveCount(0);
		await expect
			.poll(() => dateInput.evaluate((element) => getComputedStyle(element).colorScheme))
			.toContain(colorScheme);
		const editor = page.getByRole("dialog", { name: "Create access profile" });
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

test("capture contextual empty access profiles in light and dark themes", async ({
	page,
	mockApi,
}, testInfo) => {
	mockApi.mock("GET", "/api/debug/admin/registration/access-profiles", { body: [] });

	for (const colorScheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
		await page.goto("/admin/settings/access");
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		const profilesPanel = page
			.getByRole("heading", { name: "Access profiles" })
			.locator("xpath=ancestor::section[1]");
		await expect(profilesPanel.getByText("No access profiles yet", { exact: true })).toBeVisible();
		await expect(profilesPanel.getByRole("button", { name: "Create profile" })).toBeVisible();
		await assertNoHorizontalOverflow(page);
		await page.screenshot({
			path: testInfo.outputPath(`admin-access-empty-${colorScheme}.png`),
			animations: "disabled",
		});
	}
});

test("capture access editor with native focused input", async ({
	page,
	mockApi: _mock,
}, testInfo) => {
	for (const colorScheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
		await page.goto("/admin/settings/access");
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		await page.getByRole("button", { name: "Create profile" }).click();
		await page.getByLabel("Name").focus();
		await expect(page.getByRole("navigation")).toHaveCount(0);
		await assertNoHorizontalOverflow(page);
		await page.screenshot({
			path: testInfo.outputPath(`admin-access-focused-${colorScheme}.png`),
			animations: "disabled",
		});
	}
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
	await expect(page.getByRole("radiogroup", { name: "Pulse source" })).toBeVisible();
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
		await expect(page.getByText("In-app support is coming soon")).toBeVisible();
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
