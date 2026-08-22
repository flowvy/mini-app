import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { assertNoHorizontalOverflow, expect, test } from "./fixtures/mock-api.ts";
import {
	installTelegramMainButton,
	pressTelegramMainButton,
	withTelegramMainButton,
} from "./fixtures/telegram-main-button.ts";

const previewContent = {
	onboardingInviteTitle: "Private {{appName}} access",
	onboardingInviteDescription: "Paste the **invite code** from your provider",
	onboardingRedeemAction: "Enter {{appName}}",
	onboardingOpenTitle: "Start with {{appName}}",
	onboardingOpenDescription: "Create your account and get **secure access** in a minute",
	onboardingRegisterAction: "Create account",
	inviteTitle: "Bring your crew",
	inviteDescription: "Share **{{appName}}** with people you trust",
	inviteShareText: "Join {{appName}} with {{code}}",
	sponsorNoAccessTitle: "Unlock {{appName}} access",
	sponsorNoAccessDescription: "Choose a plan to activate your **private connection**",
	sponsorBaseAccessTitle: "Upgrade your {{appName}} access",
	sponsorBaseAccessDescription: "Your basic access works. Sponsorship adds **more capacity**",
	sponsorChooseAction: "View options",
};

const previewOffer = {
	id: "30000000-0000-4000-8000-000000000001",
	title: "Northstar Plus",
	description: "More capacity and priority support.",
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
	availability: "ready",
};

async function setDarkTheme(page: Page): Promise<void> {
	await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
	await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
}

async function assertStableDarkPage(page: Page): Promise<void> {
	await assertNoHorizontalOverflow(page);
	const accessibility = await new AxeBuilder({ page }).analyze();
	const serious = accessibility.violations.filter((violation) =>
		["serious", "critical"].includes(violation.impact ?? ""),
	);
	expect(serious).toEqual([]);
	const scrollContainer = page.locator('main[data-scroll-restoration-id="main-content"]');
	if ((await scrollContainer.count()) > 0) {
		await scrollContainer.evaluate((element) => {
			element.scrollTop = 0;
		});
	}
}

test("admin saves allow-listed provider content as a locale map", async ({
	page,
	mockApi: _mock,
}) => {
	await installTelegramMainButton(page);
	await page.goto(withTelegramMainButton("/admin/settings/content"));
	await expect(page.locator("header").getByText("Content", { exact: true })).toBeVisible();
	await expect(page.getByText("English", { exact: true })).toBeVisible();
	await expect(page.getByRole("heading", { name: "Support" })).toHaveCount(0);

	await page.getByLabel("Invite-only prompt").fill("Welcome to {{appName}}. Send your code here.");
	await page.getByLabel("Invite card title").fill("Bring your crew");
	const patchRequest = page.waitForRequest(
		(request) =>
			request.method() === "PATCH" &&
			new URL(request.url()).pathname === "/api/debug/admin/settings",
	);
	await pressTelegramMainButton(page);

	const payload = (await patchRequest).postDataJSON();
	expect(payload.contentLocales.en.botInviteRequired).toBe(
		"Welcome to {{appName}}. Send your code here.",
	);
	expect(payload.contentLocales.en.inviteTitle).toBe("Bring your crew");
	expect(payload).not.toHaveProperty("supportUrl");
});

test("Telegram editors insert formatting, custom emoji, templates, and invite media", async ({
	page,
	mockApi: _mock,
}) => {
	await installTelegramMainButton(page);
	await page.goto(withTelegramMainButton("/admin/settings/content"));

	const prompt = page.getByLabel("Invite-only prompt");
	await prompt.fill("Welcome {{appName}}");
	await prompt.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(0, 7));
	const telegramEditor = prompt.locator("xpath=ancestor::div[1]");
	await telegramEditor.getByRole("button", { name: "Bold" }).click();
	await expect(prompt).toHaveValue("<b>Welcome</b> {{appName}}");

	await telegramEditor.getByRole("button", { name: "Custom emoji" }).click();
	await telegramEditor.getByLabel("Emoji ID").fill("5368324170671202286");
	await telegramEditor.getByLabel("Fallback emoji").fill("👍");
	await telegramEditor.getByRole("button", { name: "Insert custom emoji" }).click();
	await expect(prompt).toHaveValue(/<tg-emoji emoji-id="5368324170671202286">👍<\/tg-emoji>/);

	const templates = page
		.getByRole("heading", { name: "Telegram bot" })
		.locator("xpath=ancestor::section[1]")
		.locator("details");
	await expect(templates).not.toHaveAttribute("open", "");
	await templates.getByText("Templates", { exact: true }).click();
	await templates.getByRole("button", { name: "Copy {{appName}}" }).click();
	await expect(templates).toContainText("Current app name");
	await expect(templates).toContainText("Copied {{appName}}");

	const fileInput = page.locator('input[type="file"]');
	await fileInput.setInputFiles({
		name: "invite.png",
		mimeType: "image/png",
		buffer: Buffer.from("image"),
	});
	await expect(page.getByText("invite.png", { exact: true })).toBeVisible();

	const patchRequest = page.waitForRequest(
		(request) =>
			request.method() === "PATCH" &&
			new URL(request.url()).pathname === "/api/debug/admin/settings",
	);
	await pressTelegramMainButton(page);
	const payload = (await patchRequest).postDataJSON();
	expect(payload.botInviteMediaFileId).toBe("telegram-file-2");
	expect(payload.botInviteMediaType).toBe("photo");
	expect(payload.contentLocales.en.botInviteRequired).toContain("<b>Welcome");
	expect(payload.contentLocales.en.botInviteRequired).toContain("<tg-emoji");
	await assertNoHorizontalOverflow(page);
});

test("Welcome editor preserves Telegram HTML and exposes copyable templates", async ({
	page,
	mockApi: _mock,
}) => {
	await installTelegramMainButton(page);
	await page.goto(withTelegramMainButton("/admin/settings/welcome"));

	const greeting = page.getByLabel("Greeting text");
	await greeting.fill("Hello {{appName}}");
	await greeting.evaluate((element: HTMLTextAreaElement) => element.setSelectionRange(0, 5));
	await page.getByRole("button", { name: "Italic" }).click();
	await expect(greeting).toHaveValue("<i>Hello</i> {{appName}}");

	const templates = page
		.getByRole("heading", { name: "Content" })
		.locator("xpath=ancestor::section[1]")
		.locator("details");
	await expect(templates).not.toHaveAttribute("open", "");
	await templates.getByText("Templates", { exact: true }).click();
	await expect(templates.getByRole("button", { name: "Copy {{appName}}" })).toBeVisible();

	const patchRequest = page.waitForRequest(
		(request) =>
			request.method() === "PATCH" &&
			new URL(request.url()).pathname === "/api/debug/admin/settings",
	);
	await pressTelegramMainButton(page);
	const payload = (await patchRequest).postDataJSON();
	expect(payload.contentLocales.en.welcomeText).toBe("<i>Hello</i> {{appName}}");
});

test("Welcome editor remains compact in light and dark themes", async ({
	page,
	mockApi: _mock,
}, testInfo) => {
	for (const colorScheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
		await page.goto("/admin/settings/welcome");
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		await expect(page.getByRole("heading", { name: "Content" })).toBeVisible();
		await assertNoHorizontalOverflow(page);
		const accessibility = await new AxeBuilder({ page }).analyze();
		const serious = accessibility.violations.filter((violation) =>
			["serious", "critical"].includes(violation.impact ?? ""),
		);
		expect(serious).toEqual([]);
		await page.screenshot({
			path: testInfo.outputPath(`welcome-editor-${colorScheme}.png`),
			fullPage: true,
			animations: "disabled",
		});
	}
});

test("Mini App invite description authors and renders safe CommonMark", async ({
	page,
	mockApi,
}) => {
	await installTelegramMainButton(page);
	await page.goto(withTelegramMainButton("/admin/settings/content"));

	const inviteEditor = page.getByRole("textbox", { name: "Invite card description" });
	await inviteEditor.fill("Bring your crew");
	await inviteEditor.press("ControlOrMeta+A");
	const inviteField = inviteEditor.locator("xpath=ancestor::div[3]");
	await inviteField.getByRole("button", { name: "Bold" }).click();

	const patchRequest = page.waitForRequest(
		(request) =>
			request.method() === "PATCH" &&
			new URL(request.url()).pathname === "/api/debug/admin/settings",
	);
	await pressTelegramMainButton(page);
	const payload = (await patchRequest).postDataJSON();
	expect(payload.contentLocales.en.inviteDescription).toBe("**Bring your crew**");

	mockApi.seedSettings({
		contentLocales: { en: { inviteDescription: "**Join {{appName}} today**" } },
	});
	await page.goto("/");
	await expect(page.getByText("Join Flowvy today", { exact: true })).toBeVisible();
	await expect(page.locator("strong").filter({ hasText: "Join Flowvy today" })).toBeVisible();
});

test("provider copy reaches invite and onboarding surfaces", async ({ page, mockApi }) => {
	mockApi.seedSettings({
		appName: "Northstar",
		contentLocales: {
			en: {
				inviteTitle: "Bring your crew",
				inviteDescription: "Share **Northstar** with people you trust",
			},
		},
	});

	await page.goto("/");
	await expect(page.getByText("Bring your crew", { exact: true })).toBeVisible();
	await expect(
		page.getByText("Share Northstar with people you trust", { exact: true }),
	).toBeVisible();
	await expect(page.locator("strong").filter({ hasText: "Northstar" })).toBeVisible();

	await page.addInitScript(() => localStorage.setItem("flowvy:mock-auth", "onboarding"));
	mockApi.mock("GET", "/api/me", {
		status: 403,
		body: { detail: { code: "invite_required", message: "An invite code is required" } },
	});
	mockApi.mock("GET", "/api/onboarding", {
		body: {
			state: "invite_required",
			registrationMode: "invite_only",
			appName: "Northstar",
			logoUrl: null,
			launchInviteAvailable: false,
			content: {
				onboardingInviteTitle: "Private Northstar access",
				onboardingInviteDescription: "Paste the **code** from your Northstar host",
				onboardingRedeemAction: "Enter Northstar",
			},
		},
	});

	await page.goto("/");
	await expect(page.getByRole("heading", { name: "Private Northstar access" })).toBeVisible();
	await expect(page.getByText("Paste the code from your Northstar host")).toBeVisible();
	await expect(page.locator("strong").filter({ hasText: "code" })).toBeVisible();
	const inviteInput = page.getByRole("textbox", { name: "Invite code" });
	await expect(inviteInput).toBeVisible();
	await expect(page.getByText("Invite code", { exact: true })).toHaveCount(0);
	await inviteInput.fill("FVY-ABCD-EFGH-IJKL");
	const redeemButton = page.getByRole("button", { name: "Enter Northstar" });
	await expect(redeemButton).toBeEnabled();
	for (const theme of ["light", "dark"] as const) {
		await page.evaluate(
			(value) => document.documentElement.setAttribute("data-theme", value),
			theme,
		);
		await page.evaluate(() => {
			for (const animation of document.getAnimations()) animation.finish();
		});
		const colors = await redeemButton.evaluate((button) => {
			const style = getComputedStyle(button);
			const probe = document.createElement("span");
			probe.style.backgroundColor = "var(--v2-bg-primary-inverted)";
			probe.style.color = "var(--v2-text-primary-inverted)";
			document.body.append(probe);
			const probeStyle = getComputedStyle(probe);
			const expectedBackground = probeStyle.backgroundColor;
			const expectedColor = probeStyle.color;
			probe.remove();
			return {
				background: style.backgroundColor,
				color: style.color,
				expectedBackground,
				expectedColor,
			};
		});
		expect(colors.background).toBe(colors.expectedBackground);
		expect(colors.color).toBe(colors.expectedColor);
	}
	await assertNoHorizontalOverflow(page);
});

test("Support ignores stale provider data and stays a Coming Soon stub", async ({
	page,
	mockApi,
}) => {
	mockApi.seedSettings({
		contentLocales: {
			en: {
				supportTitle: "Stale operator title",
				supportDescription: "Stale operator description",
				supportButtonLabel: "Stale action",
			},
		},
		supportUrl: "https://t.me/stale_support",
	});

	await page.goto("/support");
	await expect(page.getByRole("heading", { name: "Support" })).toBeVisible();
	await expect(page.getByText("In-app support is coming soon", { exact: true })).toBeVisible();
	await expect(page.getByText(/Stale operator/)).toHaveCount(0);
	await expect(page.getByRole("button", { name: "Stale action" })).toHaveCount(0);
});

test("capture dark Content settings", async ({ page, mockApi }, testInfo) => {
	mockApi.seedSettings({ appName: "Northstar", contentLocales: { en: previewContent } });
	await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
	await page.goto("/admin/settings/content");
	await setDarkTheme(page);
	await expect(page.getByRole("heading", { name: "Telegram bot" })).toBeVisible();
	await expect(page.getByRole("heading", { name: "Support" })).toHaveCount(0);
	await assertStableDarkPage(page);
	await page.screenshot({
		path: testInfo.outputPath("content-settings-dark.png"),
		fullPage: true,
		animations: "disabled",
	});
});

test("capture dark invite-only onboarding", async ({ page, mockApi }, testInfo) => {
	await page.addInitScript(() => localStorage.setItem("flowvy:mock-auth", "onboarding"));
	mockApi.mock("GET", "/api/me", {
		status: 403,
		body: { detail: { code: "invite_required", message: "Invite required" } },
	});
	mockApi.mock("GET", "/api/onboarding", {
		body: {
			state: "invite_required",
			registrationMode: "invite_only",
			appName: "Northstar",
			logoUrl: null,
			launchInviteAvailable: false,
			content: previewContent,
		},
	});
	await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
	await page.goto("/");
	await setDarkTheme(page);
	await expect(page.getByRole("heading", { name: "Private Northstar access" })).toBeVisible();
	await assertStableDarkPage(page);
	await page.screenshot({
		path: testInfo.outputPath("content-invite-onboarding-dark.png"),
		fullPage: true,
		animations: "disabled",
	});
	await page.getByRole("textbox", { name: "Invite code" }).fill("FVY-ABCD-EFGH-IJKL");
	await expect(page.getByRole("button", { name: "Enter Northstar" })).toBeEnabled();
	await page.screenshot({
		path: testInfo.outputPath("content-invite-onboarding-active-dark.png"),
		fullPage: true,
		animations: "disabled",
	});
});

test("capture dark open onboarding", async ({ page, mockApi }, testInfo) => {
	await page.addInitScript(() => localStorage.setItem("flowvy:mock-auth", "onboarding"));
	mockApi.mock("GET", "/api/me", {
		status: 403,
		body: { detail: { code: "registration_required", message: "Registration required" } },
	});
	mockApi.mock("GET", "/api/onboarding", {
		body: {
			state: "open",
			registrationMode: "open",
			appName: "Northstar",
			logoUrl: null,
			launchInviteAvailable: false,
			content: previewContent,
		},
	});
	await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
	await page.goto("/");
	await setDarkTheme(page);
	await expect(page.getByRole("heading", { name: "Start with Northstar" })).toBeVisible();
	await assertStableDarkPage(page);
	await page.screenshot({
		path: testInfo.outputPath("content-open-onboarding-dark.png"),
		fullPage: true,
		animations: "disabled",
	});
});

test("capture dark Home invite content", async ({ page, mockApi }, testInfo) => {
	mockApi.seedSettings({ appName: "Northstar", contentLocales: { en: previewContent } });
	await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
	await page.goto("/");
	await setDarkTheme(page);
	await expect(page.getByText("Bring your crew", { exact: true })).toBeVisible();
	await assertStableDarkPage(page);
	await page.screenshot({
		path: testInfo.outputPath("content-home-invite-dark.png"),
		fullPage: true,
		animations: "disabled",
	});
});

for (const sponsorState of ["no_access", "base_access"] as const) {
	test(`capture dark Home ${sponsorState} content`, async ({ page, mockApi }, testInfo) => {
		mockApi.seedSettings({ appName: "Northstar", contentLocales: { en: previewContent } });
		mockApi.seedSponsorState({
			status: sponsorState,
			accessLevel: sponsorState === "base_access" ? "base" : "none",
			primaryAction: "none",
			paidExpiresAt: null,
			baseExpiresAt: sponsorState === "base_access" ? "2099-12-31T23:59:59Z" : null,
			currentOfferId: null,
			managementUrl: null,
			pendingCheckout: null,
			offers: [previewOffer],
		});
		await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
		await page.goto("/");
		await setDarkTheme(page);
		await expect(
			page.getByRole("heading", {
				name:
					sponsorState === "base_access"
						? "Upgrade your Northstar access"
						: "Unlock Northstar access",
			}),
		).toBeVisible();
		await assertStableDarkPage(page);
		await page.screenshot({
			path: testInfo.outputPath(`content-home-${sponsorState}-dark.png`),
			fullPage: true,
			animations: "disabled",
		});
	});
}

test("capture dark Support Coming Soon stub", async ({ page, mockApi: _mock }, testInfo) => {
	await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
	await page.goto("/support");
	await setDarkTheme(page);
	await expect(page.getByText("In-app support is coming soon", { exact: true })).toBeVisible();
	await assertStableDarkPage(page);
	await page.screenshot({
		path: testInfo.outputPath("support-coming-soon-dark.png"),
		fullPage: true,
		animations: "disabled",
	});
});

test("content editor remains usable in light and dark themes", async ({
	page,
	mockApi: _mock,
}, testInfo) => {
	for (const colorScheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
		await page.goto("/admin/settings/content");
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		await expect(page.getByRole("heading", { name: "Telegram bot" })).toBeVisible();
		await expect(page.getByText("Loading editor…", { exact: true })).toHaveCount(0);
		await assertNoHorizontalOverflow(page);
		const accessibility = await new AxeBuilder({ page }).analyze();
		const serious = accessibility.violations.filter((violation) =>
			["serious", "critical"].includes(violation.impact ?? ""),
		);
		expect(serious).toEqual([]);
		await page.screenshot({
			path: testInfo.outputPath(`operator-content-${colorScheme}.png`),
			fullPage: true,
			animations: "disabled",
		});
	}
});
