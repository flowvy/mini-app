import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures/mock-api.ts";
import {
	type EdgeContract,
	expectSurfaceContract,
	expectSvgContract,
	noEdge,
	noOutline,
	type OutlineContract,
} from "./helpers/surface-contract.ts";

const themes = ["light", "dark"] as const;
type Theme = (typeof themes)[number];

const transparent = "transparent";
const primary = "var(--v2-bg-primary)";
const secondary = "var(--v2-bg-secondary)";
const tertiary = "var(--v2-bg-tertiary)";
const primaryText = "var(--v2-text-primary)";
const secondaryText = "var(--v2-text-secondary)";
const iconPositive = "var(--v2-icon-positive)";
const borderTertiary = "var(--v2-border-tertiary)";
const borderPrimary = "var(--v2-border-primary)";
const borderPositivePrimary = "var(--v2-border-positive-primary)";
const borderPositiveSecondary = "var(--v2-border-positive-secondary)";
const standaloneBorder = "color-mix(in srgb, var(--v2-border-secondary) 60%, transparent)";

const edge = (color: string, width = "1px", style = "solid"): EdgeContract => ({
	width,
	style,
	color,
});

const focusedOutline: OutlineContract = {
	...edge(borderPositivePrimary, "2px"),
	offset: "1px",
};

const splitBorder = (top: EdgeContract, right = noEdge(), bottom = noEdge(), left = noEdge()) => ({
	top,
	right,
	bottom,
	left,
});

async function useTheme(page: Page, theme: Theme): Promise<void> {
	await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
}

async function expectTheme(page: Page, theme: Theme): Promise<void> {
	await page.evaluate((selectedTheme) => {
		document.documentElement.setAttribute("data-theme", selectedTheme);
	}, theme);
	await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
}

async function expectStandaloneControl(locator: Locator): Promise<void> {
	await expectSurfaceContract(locator, {
		background: primary,
		border: edge(standaloneBorder),
		outline: noOutline(),
		boxShadow: "none",
		color: primaryText,
	});
}

for (const theme of themes) {
	test(`${theme}: access controls preserve standalone and contained surface levels`, async ({
		page,
		mockApi: _mock,
	}, testInfo) => {
		await useTheme(page, theme);
		await page.goto("/admin/settings/access");
		await expectTheme(page, theme);

		const defaultAccess = page.getByLabel("Default access");
		const defaultAccessShell = defaultAccess.locator("..");
		await expectStandaloneControl(defaultAccessShell);
		await expectSvgContract(defaultAccessShell.locator("svg"), {
			color: "var(--v2-icon-tertiary)",
			fill: "none",
			stroke: "currentColor",
		});
		await defaultAccess.focus();
		await expectSurfaceContract(defaultAccessShell, {
			background: primary,
			border: edge(borderPositiveSecondary),
			outline: noOutline(),
			boxShadow: "none",
			color: primaryText,
		});
		await defaultAccess.blur();

		if (testInfo.project.name === "desktop-chromium") {
			await defaultAccessShell.hover();
			await expectSurfaceContract(defaultAccessShell, {
				background: primary,
				border: edge(borderPositiveSecondary),
				outline: noOutline(),
				boxShadow: "none",
				color: primaryText,
			});
			await page.mouse.move(0, 0);
		}

		await page.getByRole("button", { name: "Create profile" }).click();
		const name = page.getByPlaceholder("Free 30 days");
		await expectStandaloneControl(name);
		await name.focus();
		await expectSurfaceContract(name, {
			background: primary,
			border: edge(borderPositiveSecondary),
			outline: noOutline(),
			boxShadow: "none",
			color: primaryText,
		});

		await page.getByRole("radio", { name: "Date" }).click();
		const date = page.getByRole("textbox", { name: "Expires at" });
		const containedRow = page.getByRole("group", { name: "Expires at" });
		await expectSurfaceContract(containedRow, {
			background: secondary,
			border: edge(borderTertiary),
			outline: noOutline(),
			boxShadow: "none",
			color: primaryText,
		});
		await expectSurfaceContract(date.locator(".."), {
			background: tertiary,
			border: noEdge(),
			outline: noOutline(),
			boxShadow: "none",
			color: primaryText,
		});
		await expectSvgContract(date.locator("..").locator("svg"), {
			color: "var(--v2-icon-tertiary)",
			fill: "none",
			stroke: "currentColor",
		});
		await date.focus();
		await expectSurfaceContract(containedRow, {
			background: secondary,
			border: edge(borderPositiveSecondary),
			outline: noOutline(),
			boxShadow: "none",
			color: primaryText,
		});
		await expectSurfaceContract(date.locator(".."), {
			background: tertiary,
			border: noEdge(),
			outline: noOutline(),
			boxShadow: "none",
			color: primaryText,
		});
		await date.blur();

		await page.getByRole("button", { name: "Close editor" }).click();
		await defaultAccess.selectOption({ label: "Free 30 days" });
		await expect(defaultAccess).toHaveValue("00000000-0000-4000-8000-000000000001");
		await page.getByRole("button", { name: "Edit access profile" }).click();
		await page.getByRole("radio", { name: "Automation" }).click();
		const warning = page.getByText(
			"This profile is the registration default. Choose another default access profile before using automation-controlled expiry",
		);
		await expectSurfaceContract(warning, {
			background: "var(--v2-bg-warning)",
			border: edge("var(--v2-border-warning-secondary)"),
			outline: noOutline(),
			boxShadow: "none",
			color: "var(--v2-text-warning)",
		});
	});

	test(`${theme}: invite registration keeps input focus and action error semantics`, async ({
		page,
		mockApi,
	}) => {
		await useTheme(page, theme);
		await page.addInitScript(() => localStorage.setItem("flowvy:mock-auth", "onboarding"));
		mockApi.mock("GET", "/api/me", {
			status: 403,
			body: { detail: { code: "invite_required", message: "An invite code is required" } },
		});
		mockApi.mock("GET", "/api/onboarding", {
			body: {
				state: "invite_required",
				registrationMode: "invite_only",
				appName: "Flowvy Test",
				logoUrl: null,
				launchInviteAvailable: false,
			},
		});
		mockApi.mock("POST", "/api/onboarding/redeem", {
			status: 400,
			body: { detail: { code: "invalid_invite", message: "Invite is invalid" } },
		});

		await page.goto("/");
		await expectTheme(page, theme);
		await expectSurfaceContract(page.locator('[data-ui="onboarding-card"]'), {
			background: primary,
			border: edge(borderTertiary),
			outline: noOutline(),
			boxShadow: "var(--v2-shadow)",
			color: primaryText,
		});
		const onboardingBody = page.locator('[data-ui="onboarding-form-body"]');
		await expectSurfaceContract(onboardingBody, {
			background: transparent,
			border: noEdge(),
			outline: noOutline(),
			boxShadow: "none",
			color: primaryText,
		});
		await expect
			.poll(() =>
				onboardingBody.evaluate((element) => {
					const style = getComputedStyle(element);
					return {
						inlineStart: style.paddingInlineStart,
						inlineEnd: style.paddingInlineEnd,
					};
				}),
			)
			.toEqual({ inlineStart: "0px", inlineEnd: "0px" });
		const invite = page.getByLabel("Invite code");
		await expectStandaloneControl(invite);
		await invite.focus();
		await expectSurfaceContract(invite, {
			background: primary,
			border: edge(borderPositiveSecondary),
			outline: noOutline(),
			boxShadow: "none",
			color: primaryText,
		});
		await invite.fill("FVY-WRONG-CODE");
		await page.getByRole("button", { name: "Continue" }).click();

		const error = page.getByRole("alert");
		await expect(error).toBeFocused();
		await expectSurfaceContract(error, {
			background: "var(--v2-bg-negative-secondary)",
			border: edge("var(--v2-border-negative-secondary)"),
			outline: {
				...edge("currentColor", "2px"),
				offset: "2px",
			},
			boxShadow: "none",
			color: "var(--v2-text-negative)",
		});
	});

	test(`${theme}: success feedback preserves its semantic surface contract`, async ({
		page,
		mockApi: _mock,
	}) => {
		await useTheme(page, theme);
		await page.goto("/admin/settings/tribute/payment-links");
		await expectTheme(page, theme);
		await page.getByLabel("Supporter").fill("https://t.me/tribute/app?startapp=subscription_12");
		await page.getByRole("button", { name: "Save payment links" }).click();
		const success = page.getByText("Payment links saved", { exact: true });
		await expectSurfaceContract(success, {
			background: "var(--v2-bg-positive-quaternary)",
			border: edge("var(--v2-border-positive-secondary)"),
			outline: noOutline(),
			boxShadow: "none",
			color: "var(--v2-text-positive)",
		});
	});

	test(`${theme}: formatted editor preserves shell, menu, body, footer and link layers`, async ({
		page,
		mockApi: _mock,
	}, testInfo) => {
		await useTheme(page, theme);
		await page.goto("/admin/settings/content?message=onboardingInvite");
		await expectTheme(page, theme);
		const body = page.getByRole("textbox", { name: "Invite registration description" });
		const shell = body.locator("xpath=ancestor::*[@data-ui='formatted-text-editor']");
		const toolbar = shell.getByRole("toolbar", { name: "Text formatting" });
		const menu = toolbar.locator("..");
		const footer = shell.getByText("Select text to format it").locator("..");

		await expectSurfaceContract(shell, {
			background: primary,
			border: edge(borderTertiary),
			outline: noOutline(),
			boxShadow: "none",
			color: primaryText,
		});

		await body.fill("Readable formatting");
		await body.press("ControlOrMeta+A");
		await toolbar.getByRole("button", { name: "Quote" }).click();
		const quote = body.locator("blockquote");
		await expectSurfaceContract(quote, {
			background: transparent,
			border: splitBorder(noEdge(), noEdge(), noEdge(), edge(borderPrimary, "2px")),
			outline: noOutline(),
			boxShadow: "none",
			color: primaryText,
		});
		await body.press("ControlOrMeta+A");
		await toolbar.getByRole("button", { name: "Quote" }).click();
		await toolbar.getByRole("button", { name: "Bulleted list" }).click();
		const listItem = body.locator("li").first();
		await expect(listItem).toBeVisible();
		expect(await listItem.evaluate((element) => getComputedStyle(element, "::marker").color)).toBe(
			await body.evaluate((element) => getComputedStyle(element).color),
		);
		const accessibility = await new AxeBuilder({ page })
			.include('[data-ui="formatted-text-editor"]')
			.analyze();
		expect(accessibility.violations).toEqual([]);
		await shell.screenshot({
			path: testInfo.outputPath(`formatted-editor-${theme}.png`),
			animations: "disabled",
		});
		await expectSurfaceContract(menu, {
			background: primary,
			border: splitBorder(noEdge(), noEdge(), edge(borderTertiary)),
			outline: noOutline(),
			boxShadow: "none",
			color: primaryText,
		});
		await expectSurfaceContract(body, {
			background: transparent,
			border: noEdge(),
			outline: noOutline(),
			boxShadow: "none",
			color: primaryText,
		});
		await expectSurfaceContract(footer, {
			background: transparent,
			border: splitBorder(edge(borderTertiary)),
			outline: noOutline(),
			boxShadow: "none",
			color: secondaryText,
		});

		const linkButton = toolbar.getByRole("button", { name: "Add or edit link" });
		if (testInfo.project.name === "desktop-chromium") {
			await linkButton.hover();
			await expectSurfaceContract(linkButton, {
				background: tertiary,
				border: noEdge(),
				outline: noOutline(),
				boxShadow: "none",
				color: "var(--v2-icon-primary)",
			});
			await page.mouse.move(0, 0);
			const bold = toolbar.getByRole("button", { name: "Bold" });
			await bold.click();
			await expect(bold).toHaveAttribute("aria-pressed", "true");
			await bold.hover();
			await expectSurfaceContract(bold, {
				background: "var(--v2-bg-positive-quaternary)",
				border: noEdge(),
				outline: noOutline(),
				boxShadow: "none",
				color: iconPositive,
			});
			await page.mouse.move(0, 0);
		}
		await linkButton.click();
		const linkInput = page.getByLabel("Link address");
		await expect(linkInput).toBeFocused();
		await expectSurfaceContract(linkInput, {
			background: primary,
			border: edge(standaloneBorder),
			outline: focusedOutline,
			boxShadow: "none",
			color: primaryText,
		});
		await expectSurfaceContract(shell, {
			background: primary,
			border: edge(borderPositiveSecondary),
			outline: noOutline(),
			boxShadow: "none",
			color: primaryText,
		});
	});

	test(`${theme}: Telegram HTML editor preserves editor and custom emoji layers`, async ({
		page,
		mockApi: _mock,
	}, testInfo) => {
		await useTheme(page, theme);
		await page.goto("/admin/settings/welcome");
		await expectTheme(page, theme);
		const body = page.getByLabel("Greeting text");
		const shell = body.locator("xpath=ancestor::*[@data-ui='telegram-html-editor']");
		const toolbar = shell.getByRole("toolbar", { name: "Telegram text formatting" });
		const menu = toolbar.locator("..");
		const footer = shell.getByText(/Select text to format it/).locator("..");

		await expectSurfaceContract(shell, {
			background: primary,
			border: edge(borderTertiary),
			outline: noOutline(),
			boxShadow: "none",
			color: primaryText,
		});
		await expectSurfaceContract(menu, {
			background: primary,
			border: splitBorder(noEdge(), noEdge(), edge(borderTertiary)),
			outline: noOutline(),
			boxShadow: "none",
			color: primaryText,
		});
		await expectSurfaceContract(body, {
			background: transparent,
			border: noEdge(),
			outline: noOutline(),
			boxShadow: "none",
			color: primaryText,
		});
		await expectSurfaceContract(footer, {
			background: transparent,
			border: splitBorder(edge(borderTertiary)),
			outline: noOutline(),
			boxShadow: "none",
			color: secondaryText,
		});

		await body.fill("Readable Telegram formatting");
		await body.press("ControlOrMeta+A");
		await toolbar.getByRole("button", { name: "Quote" }).click();
		const quote = body.locator("blockquote");
		await expectSurfaceContract(quote, {
			background: transparent,
			border: splitBorder(noEdge(), noEdge(), noEdge(), edge(borderPrimary, "2px")),
			outline: noOutline(),
			boxShadow: "none",
			color: primaryText,
		});
		await body.press("ControlOrMeta+A");
		await toolbar.getByRole("button", { name: "Spoiler" }).click();
		await expectSurfaceContract(body.locator("tg-spoiler"), {
			background: tertiary,
			border: noEdge(),
			outline: noOutline(),
			boxShadow: "none",
			color: primaryText,
		});
		await body.press("ArrowRight");

		const bold = toolbar.getByRole("button", { name: "Bold" });
		if (testInfo.project.name === "desktop-chromium") {
			await bold.hover();
			await expectSurfaceContract(bold, {
				background: tertiary,
				border: noEdge(),
				outline: noOutline(),
				boxShadow: "none",
				color: "var(--v2-icon-primary)",
			});
			await page.mouse.move(0, 0);
		}

		const customEmoji = toolbar.getByRole("button", { name: "Custom emoji" });
		await customEmoji.click();
		if (testInfo.project.name === "desktop-chromium") await page.mouse.move(0, 0);
		await expectSurfaceContract(customEmoji, {
			background: "var(--v2-bg-positive-quaternary)",
			border: noEdge(),
			outline: noOutline(),
			boxShadow: "none",
			color: iconPositive,
		});
		await expectSvgContract(customEmoji.locator("svg"), {
			color: iconPositive,
			fill: "none",
			stroke: "currentColor",
		});
		if (testInfo.project.name === "desktop-chromium") {
			await customEmoji.hover();
			await expectSurfaceContract(customEmoji, {
				background: "var(--v2-bg-positive-quaternary)",
				border: noEdge(),
				outline: noOutline(),
				boxShadow: "none",
				color: iconPositive,
			});
			await page.mouse.move(0, 0);
		}
		const emojiId = shell.getByLabel("Emoji ID");
		const emojiPanel = emojiId.locator("xpath=ancestor::fieldset[1]");
		await expectSurfaceContract(emojiPanel, {
			background: transparent,
			border: splitBorder(edge(borderTertiary)),
			outline: noOutline(),
			boxShadow: "none",
			color: primaryText,
		});
		await expectStandaloneControl(emojiId);
		await shell.screenshot({
			path: testInfo.outputPath(`telegram-html-editor-${theme}.png`),
			animations: "disabled",
		});
	});
}
