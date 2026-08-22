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
	await expect(page.locator("header").getByText("Tone of Voice", { exact: true })).toBeVisible();
	await expect(page.getByText("English", { exact: true })).toBeVisible();
	await expect(page.getByRole("heading", { name: "Support" })).toHaveCount(0);

	await page.getByLabel("Invite registration title").fill("Private {{appName}} access");
	await page.getByLabel("User-facing message").selectOption("inviteCard");
	await page.getByLabel("Invite card title").fill("Bring your crew");
	const patchRequest = page.waitForRequest(
		(request) =>
			request.method() === "PATCH" &&
			new URL(request.url()).pathname === "/api/debug/admin/settings",
	);
	await pressTelegramMainButton(page);

	const payload = (await patchRequest).postDataJSON();
	expect(payload.contentLocales.en.onboardingInviteTitle).toBe("Private {{appName}} access");
	expect(payload.contentLocales.en.inviteTitle).toBe("Bring your crew");
	expect(payload.contentLocales.en).not.toHaveProperty("botInviteRequired");
	expect(payload).not.toHaveProperty("supportUrl");
});

test("Telegram invite share exposes formatting, media, preview and audience settings", async ({
	page,
	mockApi: _mock,
}, testInfo) => {
	await installTelegramMainButton(page);
	await page.goto(withTelegramMainButton("/admin/settings/content"));
	await page.getByLabel("User-facing message").selectOption("inviteShare");

	const message = page.getByRole("textbox", { name: "Telegram share message" });
	await message.fill("Join <b>{{appName}}</b> with <code>{{code}}</code>");
	await expect(page.getByRole("button", { name: "Link" })).toBeVisible();
	await page.getByLabel("Referral button label").fill("Open {{appName}}");
	await page.locator('input[type="file"][accept*=".mp4"]').setInputFiles({
		name: "invite.mp4",
		mimeType: "video/mp4",
		buffer: Buffer.from("video"),
	});
	await expect(page.getByText("invite.mp4", { exact: true })).toBeVisible();
	await expect(page.getByLabel("Referral link preview")).toBeDisabled();
	await expect(
		page.getByText("Choose which chat types appear when a user shares this invite", {
			exact: true,
		}),
	).toBeVisible();
	await expect(page.getByText("Private chats with Telegram users", { exact: true })).toBeVisible();
	await expect(page.getByText("Telegram group chats", { exact: true })).toBeVisible();
	await expect(page.getByText("Telegram channels", { exact: true })).toBeVisible();
	await expect(page.getByText("Private chats with Telegram bots", { exact: true })).toBeVisible();
	const privateChatToggle = page.getByRole("switch", { name: "Show people" });
	await expect(privateChatToggle).toHaveCSS("width", "36px");
	await expect(privateChatToggle).toHaveCSS("height", "20px");
	const audiencePanel = page.locator("section").filter({
		has: page.getByRole("heading", { name: "Share recipient types" }),
	});
	await audiencePanel.scrollIntoViewIfNeeded();
	for (const colorScheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		await audiencePanel.screenshot({
			path: testInfo.outputPath(`invite-share-audience-${colorScheme}.png`),
			animations: "disabled",
		});
	}
	await page.getByRole("switch", { name: "Show channels" }).click();

	const patchRequest = page.waitForRequest(
		(request) =>
			request.method() === "PATCH" &&
			new URL(request.url()).pathname === "/api/debug/admin/settings",
	);
	await pressTelegramMainButton(page);
	const payload = (await patchRequest).postDataJSON();
	expect(payload.contentLocales.en.inviteShareText).toContain("<b>{{appName}}</b>");
	expect(payload.contentLocales.en.inviteShareButtonText).toBe("Open {{appName}}");
	expect(payload.inviteShareMediaType).toBe("video");
	expect(payload.inviteShareMediaFileId).toBe("telegram-invite-file-1");
	expect(payload.inviteShareAllowChannelChats).toBe(true);
	await assertNoHorizontalOverflow(page);
});

test("plain and CommonMark Tone of Voice fields share one global text scale", async ({
	page,
	mockApi: _mock,
}) => {
	await page.goto("/admin/settings/content");
	await expect(page.getByText("Loading editor…", { exact: true })).toHaveCount(0);

	const expectedSize = 13;
	const title = page.getByLabel("Invite registration title");
	const description = page.getByRole("textbox", { name: "Invite registration description" });

	for (const control of [title, description]) {
		expect(
			await control.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
		).toBe(expectedSize);
	}

	const typography = await title.evaluate((element) => ({
		value: Number.parseFloat(getComputedStyle(element).fontSize),
		placeholder: Number.parseFloat(getComputedStyle(element, "::placeholder").fontSize),
	}));
	expect(typography.placeholder).toBe(typography.value);

	const commonMarkPlaceholder = description.locator("p.is-editor-empty");
	await expect(commonMarkPlaceholder).toHaveCount(1);
	expect(
		await commonMarkPlaceholder.evaluate((element) =>
			Number.parseFloat(getComputedStyle(element, "::before").fontSize),
		),
	).toBe(expectedSize);
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
	await greeting.press("End");
	const telegramEditor = greeting.locator("xpath=ancestor::div[1]");
	await telegramEditor.getByRole("button", { name: "Custom emoji" }).click();
	await telegramEditor.getByLabel("Emoji ID").fill("5368324170671202286");
	await telegramEditor.getByLabel("Fallback emoji").fill("👍");
	await telegramEditor.getByRole("button", { name: "Insert custom emoji" }).click();
	await expect(greeting).toHaveValue(/<tg-emoji emoji-id="5368324170671202286">👍<\/tg-emoji>/);

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
	expect(payload.contentLocales.en.welcomeText).toContain("<i>Hello");
	expect(payload.contentLocales.en.welcomeText).toContain("{{appName}}");
	expect(payload.contentLocales.en.welcomeText).toContain("<tg-emoji");
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
	await page.getByLabel("User-facing message").selectOption("inviteCard");

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

test("capture dark Tone of Voice settings", async ({ page, mockApi }, testInfo) => {
	mockApi.seedSettings({ appName: "Northstar", contentLocales: { en: previewContent } });
	await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
	await page.goto("/admin/settings/content");
	await setDarkTheme(page);
	await expect(page.getByRole("heading", { name: "Invite-only registration" })).toBeVisible();
	await expect(page.getByText("Invite-only prompt", { exact: true })).toHaveCount(0);
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

test("focused Tone of Voice editor remains usable in every required viewport and theme", async ({
	page,
	mockApi: _mock,
}, testInfo) => {
	for (const viewport of [
		{ name: "narrow", width: 320, height: 568 },
		{ name: "mobile", width: 430, height: 932 },
		{ name: "desktop", width: 1280, height: 900 },
	] as const) {
		for (const colorScheme of ["light", "dark"] as const) {
			await page.setViewportSize(viewport);
			await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
			await page.goto("/admin/settings/content");
			await page.evaluate((theme) => {
				document.documentElement.setAttribute("data-theme", theme);
			}, colorScheme);
			await expect(
				page.locator("header").getByText("Tone of Voice", { exact: true }),
			).toBeVisible();
			await expect(page.getByRole("heading", { name: "Invite-only registration" })).toBeVisible();
			await expect(page.getByRole("heading", { name: "Open registration" })).toHaveCount(0);
			const variables = page
				.getByRole("heading", { name: "Variables for this message" })
				.locator("xpath=ancestor::section[1]");
			await expect(variables.locator("details")).toHaveCount(0);
			await expect(variables.getByRole("button", { name: "Copy {{appName}}" })).toBeVisible();

			await page.getByLabel("User-facing message").selectOption("inviteShare");
			await expect(page.getByRole("textbox", { name: "Telegram share message" })).toBeVisible();
			await expect(variables.getByRole("button", { name: "Copy {{code}}" })).toBeVisible();
			await page.screenshot({
				path: testInfo.outputPath(`tone-of-voice-share-${viewport.name}-${colorScheme}.png`),
				fullPage: true,
				animations: "disabled",
			});
			await page.getByLabel("User-facing message").selectOption("inviteRegistration");

			await expect(page.getByText("Loading editor…", { exact: true })).toHaveCount(0);
			await assertNoHorizontalOverflow(page);
			const accessibility = await new AxeBuilder({ page }).analyze();
			const serious = accessibility.violations.filter((violation) =>
				["serious", "critical"].includes(violation.impact ?? ""),
			);
			expect(serious).toEqual([]);
			await page.screenshot({
				path: testInfo.outputPath(`tone-of-voice-${viewport.name}-${colorScheme}.png`),
				fullPage: true,
				animations: "disabled",
			});
		}
	}
});
