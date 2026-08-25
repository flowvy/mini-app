import AxeBuilder from "@axe-core/playwright";
import type { Locator, Page } from "@playwright/test";
import { assertNoHorizontalOverflow, expect, test } from "./fixtures/mock-api.ts";
import {
	type EdgeContract,
	expectSurfaceContract,
	noEdge,
	noOutline,
} from "./helpers/surface-contract.ts";

const themes = ["light", "dark"] as const;
const primary = "var(--v2-bg-primary)";
const secondary = "var(--v2-bg-secondary)";
const floor0 = "var(--v2-floor-0)";
const primaryText = "var(--v2-text-primary)";
const secondaryText = "var(--v2-text-secondary)";
const primaryIcon = "var(--v2-icon-primary)";
const secondaryIcon = "var(--v2-icon-secondary)";
const positiveIcon = "var(--v2-icon-positive)";
const borderTertiary = "var(--v2-border-tertiary)";
const standaloneBorder = "color-mix(in srgb, var(--v2-border-secondary) 60%, transparent)";

const edge = (color: string, width = "1px", style = "solid"): EdgeContract => ({
	width,
	style,
	color,
});

async function setTheme(page: Page, theme: (typeof themes)[number]): Promise<void> {
	await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
	await page.evaluate((selectedTheme) => {
		document.documentElement.setAttribute("data-theme", selectedTheme);
	}, theme);
	await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
}

async function expectPrimaryFrame(locator: Locator): Promise<void> {
	await expectSurfaceContract(locator, {
		background: primary,
		border: edge(borderTertiary),
		outline: noOutline(),
		boxShadow: "none",
		color: primaryText,
	});
}

async function expectSecondaryFrame(locator: Locator, color = primaryText): Promise<void> {
	await expectSurfaceContract(locator, {
		background: secondary,
		border: edge(borderTertiary),
		outline: noOutline(),
		boxShadow: "none",
		color,
	});
}

async function expectNeutralBadge(locator: Locator): Promise<void> {
	await expectSurfaceContract(locator, {
		background: secondary,
		border: edge(borderTertiary),
		outline: noOutline(),
		boxShadow: "none",
		color: secondaryText,
	});
}

async function expectTokenColor(locator: Locator, token: string): Promise<void> {
	await expect(locator).toBeVisible();
	const expectedColor = await locator.evaluate((element, value) => {
		const probe = document.createElement("span");
		probe.style.color = value;
		element.ownerDocument.body.append(probe);
		const resolved = getComputedStyle(probe).color;
		probe.remove();
		return resolved;
	}, token);
	await expect
		.poll(() => locator.evaluate((element) => getComputedStyle(element).color))
		.toBe(expectedColor);
}

async function expectAccessiblePage(page: Page, includeDialog = false): Promise<void> {
	await assertNoHorizontalOverflow(page);
	const axe = new AxeBuilder({ page }).include("main");
	if (includeDialog) axe.include('dialog, [role="dialog"]');
	const { violations } = await axe.analyze();
	expect(violations).toEqual([]);
}

const sponsorOffer = {
	id: "30000000-0000-4000-8000-000000000001",
	title: "Sponsor access",
	description: "Support keeps the service available.",
	commerceRuleId: "10000000-0000-4000-8000-000000000012",
	isPublished: false,
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
	availability: "draft",
	welcomeDiscount: false,
	welcomeDiscountPercent: null,
};

const sponsorRule = {
	id: sponsorOffer.commerceRuleId,
	provider: "tribute",
	name: "Tribute monthly supporter",
	commerceType: "subscription",
	paymentMode: "recurring",
	externalItemId: "12",
	currency: "RUB",
	calculationType: "provider_expiry",
	fixedDurationDays: null,
	amountBands: [],
	accessProfileId: "00000000-0000-4000-8000-000000000001",
	grantMode: "replace",
	priority: 100,
	isEnabled: true,
};

const legacyOffer = {
	...sponsorOffer,
	id: "30000000-0000-4000-8000-000000000002",
	title: "Legacy sponsor access",
	sortOrder: 20,
};

const volumeRule = {
	id: "10000000-0000-4000-8000-000000000013",
	provider: "tribute",
	name: "Flexible sponsor donations",
	commerceType: "donation",
	paymentMode: "any",
	externalItemId: null,
	currency: "RUB",
	calculationType: "volume",
	fixedDurationDays: null,
	amountBands: [{ fromAmountMinor: 50_000, unitAmountMinor: 50_000, unitDays: 30 }],
	accessProfileId: "00000000-0000-4000-8000-000000000001",
	grantMode: "extend",
	priority: 100,
	isEnabled: true,
};

const donationOffer = {
	...sponsorOffer,
	id: "30000000-0000-4000-8000-000000000003",
	title: "Donation support",
	commerceRuleId: volumeRule.id,
	commerceType: "donation",
	paymentMode: "any",
	externalItemId: null,
	checkoutUrl: "https://t.me/tribute/app?startapp=donation_month",
	expectedAmountMinor: 50_000,
	expectedPaymentMode: "one_time",
	priceOptions: [{ priceMajor: "500", currency: "RUB", period: null }],
	requiresNonAnonymous: true,
};

async function expectFloorBody(locator: Locator): Promise<void> {
	await expectSurfaceContract(locator, {
		background: floor0,
		border: noEdge(),
		outline: noOutline(),
		boxShadow: "none",
		color: primaryText,
	});
}

async function expectTransparentBody(locator: Locator): Promise<void> {
	await expectSurfaceContract(locator, {
		background: "transparent",
		border: noEdge(),
		outline: noOutline(),
		boxShadow: "none",
		color: primaryText,
	});
}

async function expectIconTile(locator: Locator, background: string): Promise<void> {
	await expectSurfaceContract(locator, {
		background,
		border: noEdge(),
		outline: noOutline(),
		boxShadow: "none",
		color: secondaryIcon,
	});
}

async function expectAvatar(locator: Locator, background: string, color: string): Promise<void> {
	await expectSurfaceContract(locator, {
		background,
		border: edge(borderTertiary),
		outline: noOutline(),
		boxShadow: "none",
		color,
	});
}

async function expectMessage(
	locator: Locator,
	background: string,
	boxShadow = "none",
	color = primaryText,
): Promise<void> {
	await expectSurfaceContract(locator, {
		background,
		border: edge(borderTertiary),
		outline: noOutline(),
		boxShadow,
		color,
	});
}

for (const theme of themes) {
	test(`${theme}: Request and Manage Quick Answers preserve nested Desktop surface levels`, async ({
		page,
		mockApi: _mock,
	}) => {
		await page.goto("/support/new");
		await setTheme(page, theme);
		const newRequestFrame = page.getByLabel("Subject").locator("xpath=ancestor::form");
		await expectPrimaryFrame(newRequestFrame);
		await expectTransparentBody(page.locator('[data-ui="support-new-fields"]'));
		await expectSurfaceContract(page.getByLabel("Subject"), {
			background: primary,
			border: edge(standaloneBorder),
			outline: noOutline(),
			boxShadow: "none",
			color: primaryText,
		});
		await expectPrimaryFrame(page.locator('[data-ui="formatted-text-editor"]'));

		await page.goto("/support/requests/request-31");
		await setTheme(page, theme);

		const details = page
			.getByRole("heading", { name: "Request details" })
			.locator("xpath=ancestor::section")
			.locator('[data-ui="form-section-card"]');
		await expectPrimaryFrame(details);

		const conversation = page.locator('[data-ui="support-conversation"]');
		await expectFloorBody(conversation);
		await expectMessage(conversation.locator('[data-author="user"]').first(), primary);
		await expectMessage(
			conversation.locator('[data-author="support"]').first(),
			secondary,
			"inset 3px 0 0 var(--v2-border-positive-primary)",
		);
		await expectAvatar(
			conversation.locator('[data-author="user"] [data-ui="support-message-avatar"]').first(),
			secondary,
			secondaryIcon,
		);
		await expectAvatar(
			conversation.locator('[data-author="support"] [data-ui="support-message-avatar"]').first(),
			primary,
			positiveIcon,
		);
		await expectMessage(
			conversation.locator('[data-ui="support-message-file"]').first(),
			secondary,
			"none",
			secondaryIcon,
		);
		await expectIconTile(conversation.locator('[data-ui="support-file-kind"]').first(), primary);

		const composer = page.locator('[data-ui="support-reply-composer"]');
		await expectTransparentBody(composer);
		await expectPrimaryFrame(composer.locator('[data-ui="formatted-text-editor"]'));

		await page.evaluate(() => localStorage.setItem("flowvy:mock-role", "user"));
		await page.goto("/support/requests/request-31");
		await setTheme(page, theme);
		const userConversation = page.locator('[data-ui="support-conversation"]');
		await expectMessage(userConversation.locator('[data-author="user"]').first(), secondary);
		await expectMessage(
			userConversation.locator('[data-author="support"]').first(),
			primary,
			"inset 3px 0 0 var(--v2-border-positive-primary)",
		);
		await expectAvatar(
			userConversation.locator('[data-author="user"] [data-ui="support-message-avatar"]').first(),
			primary,
			secondaryIcon,
		);
		await expectAvatar(
			userConversation
				.locator('[data-author="support"] [data-ui="support-message-avatar"]')
				.first(),
			secondary,
			positiveIcon,
		);
		await expectMessage(
			userConversation.locator('[data-ui="support-message-file"]').first(),
			primary,
			"none",
			secondaryIcon,
		);
		await expectIconTile(
			userConversation.locator('[data-ui="support-file-kind"]').first(),
			secondary,
		);
		await page.evaluate(() => localStorage.setItem("flowvy:mock-role", "admin"));

		await page.goto("/support/manage/answers");
		await setTheme(page, theme);
		const articleList = page
			.getByRole("heading", { name: "Articles" })
			.locator("xpath=ancestor::section")
			.locator('[data-ui="form-section-card"]');
		await expectPrimaryFrame(articleList);

		await page.getByRole("button", { name: "Edit Refresh a subscription profile" }).click();
		const fields = page.locator('[data-ui="support-article-fields"]');
		await expectTransparentBody(fields);
		await expectSurfaceContract(page.getByLabel("Title"), {
			background: primary,
			border: edge(standaloneBorder),
			outline: noOutline(),
			boxShadow: "none",
			color: primaryText,
		});
	});

	test(`${theme}: Settings uses the shared editing-body depth and full-width dividers`, async ({
		page,
		mockApi: _mock,
	}, testInfo) => {
		for (const route of [
			"/admin/settings/kuma",
			"/admin/settings/beszel",
			"/admin/settings/branding",
			"/admin/settings/welcome",
			"/admin/settings/content",
			"/admin/settings/access",
			"/admin/settings/tribute/payment-links",
		]) {
			await page.goto(route);
			await setTheme(page, theme);
			const fields = page.locator('[data-ui="settings-fields"]');
			await expect(fields.first()).toBeVisible();
			for (const fieldGroup of await fields.all()) {
				await expectTransparentBody(fieldGroup);
				await expectPrimaryFrame(
					fieldGroup.locator('xpath=ancestor::*[@data-ui="settings-surface"]'),
				);
			}
		}

		for (const route of ["/admin/settings/support", "/admin/settings/content"]) {
			await page.goto(route);
			await setTheme(page, theme);
			const insets = page.locator('[data-ui="settings-inset"]');
			await expect(insets.first()).toBeVisible();
			for (const inset of await insets.all()) await expectTransparentBody(inset);
		}

		await page.goto("/admin/settings/kuma");
		await setTheme(page, theme);
		const panel = page.locator('[data-ui="settings-surface"]').first();
		const divider = panel.locator('[data-ui="settings-divider"]').first();
		await expectSurfaceContract(divider, {
			background: borderTertiary,
			border: noEdge(),
			outline: noOutline(),
			boxShadow: "none",
			color: primaryText,
		});
		await expect
			.poll(async () => {
				const [panelBox, dividerBox] = await Promise.all([
					panel.boundingBox(),
					divider.boundingBox(),
				]);
				if (!panelBox || !dividerBox) return null;
				return {
					left: Math.round(dividerBox.x - panelBox.x),
					right: Math.round(panelBox.x + panelBox.width - (dividerBox.x + dividerBox.width)),
				};
			})
			.toEqual({ left: 1, right: 1 });

		await page.goto("/admin/settings/tribute/referral-benefits");
		await setTheme(page, theme);
		await page.getByRole("switch", { name: "Enable inviter reward days" }).click();
		await page.getByRole("switch", { name: "Enable welcome discount" }).click();
		const conditionalFields = page.locator('[data-ui="settings-fields"]');
		await expect(conditionalFields).toHaveCount(2);
		for (const fieldGroup of await conditionalFields.all()) await expectTransparentBody(fieldGroup);
		await expectAccessiblePage(page);
		await page.screenshot({
			path: testInfo.outputPath(`${theme}-settings-referral-fields.png`),
			animations: "disabled",
			fullPage: true,
		});

		await page.goto("/admin/settings/access");
		await setTheme(page, theme);
		await page.getByRole("button", { name: "Create profile" }).click();
		const accessFields = page.locator('[data-ui="access-profile-fields"]');
		await expectTransparentBody(accessFields);
		await expectPrimaryFrame(
			page.getByRole("heading", { name: "Profile details" }).locator("xpath=parent::div"),
		);
		await page.getByText("Advanced Remnawave fields").click();
		await expectSurfaceContract(page.locator('[data-ui="access-profile-advanced-fields"]'), {
			background: "transparent",
			border: {
				top: edge(borderTertiary),
				right: noEdge(),
				bottom: noEdge(),
				left: noEdge(),
			},
			outline: noOutline(),
			boxShadow: "none",
			color: primaryText,
		});
		await expectAccessiblePage(page, true);
		await page.screenshot({
			path: testInfo.outputPath(`${theme}-settings-access-profile-editor.png`),
			animations: "disabled",
			fullPage: true,
		});
		await page.getByRole("button", { name: "Close editor" }).click();
	});

	test(`${theme}: Settings nested entities preserve reference-backed surface and text roles`, async ({
		page,
		mockApi,
	}, testInfo) => {
		mockApi.seedCommerceRules([sponsorRule]);
		mockApi.seedSponsorOffers([sponsorOffer, legacyOffer]);

		await page.goto("/admin/settings/tribute/sponsor-offers");
		await setTheme(page, theme);
		const offer = page.getByRole("article", { name: sponsorOffer.title });
		await expectSecondaryFrame(offer);
		const legacy = page.locator('[data-ui="legacy-sponsor-offer"]');
		await expectSecondaryFrame(legacy);
		await expectNeutralBadge(offer.locator('[data-availability="draft"]'));
		await expectNeutralBadge(legacy.locator('[data-availability="draft"]'));
		await expectSurfaceContract(offer.getByRole("list", { name: "Payment options from Tribute" }), {
			background: primary,
			border: edge(borderTertiary),
			outline: noOutline(),
			boxShadow: "none",
			color: primaryText,
		});
		await expectAccessiblePage(page);
		await page.screenshot({
			path: testInfo.outputPath(`${theme}-settings-sponsor-offers.png`),
			animations: "disabled",
			fullPage: true,
		});

		await offer.getByRole("button", { name: "Edit", exact: true }).click();
		const offerDialog = page.getByRole("dialog", { name: "Edit sponsor offer" });
		const offerFields = offerDialog.locator('[data-ui="sponsor-offer-fields"]');
		await expect(offerFields).toHaveCount(2);
		for (const fieldGroup of await offerFields.all()) {
			await expectTransparentBody(fieldGroup);
			await expectPrimaryFrame(fieldGroup.locator(".."));
		}
		await offerFields
			.first()
			.locator("..")
			.screenshot({
				path: testInfo.outputPath(`${theme}-settings-sponsor-presentation.png`),
				animations: "disabled",
			});
		const templates = offerDialog.locator("details").filter({ hasText: "Templates" });
		await expectSecondaryFrame(templates);
		const templatesSummary = templates.locator("summary");
		await templatesSummary.click();
		const appNameVariable = templates.getByRole("button", { name: "Copy {{appName}}" });
		await expectSurfaceContract(appNameVariable, {
			background: primary,
			border: edge(borderTertiary),
			outline: noOutline(),
			boxShadow: "none",
			color: secondaryIcon,
		});
		if (testInfo.project.name === "desktop-chromium") {
			await templatesSummary.hover();
			await expectSurfaceContract(templatesSummary, {
				background: "var(--v2-bg-tertiary)",
				border: noEdge(),
				outline: noOutline(),
				boxShadow: "none",
				color: primaryText,
			});
			await expectAccessiblePage(page, true);
			await appNameVariable.hover();
			await expectSurfaceContract(appNameVariable, {
				background: "var(--v2-bg-tertiary)",
				border: edge(borderTertiary),
				outline: noOutline(),
				boxShadow: "none",
				color: primaryIcon,
			});
			await expectTokenColor(appNameVariable.locator("code"), primaryText);
			await expectTokenColor(appNameVariable.locator("span > span"), primaryText);
		}
		await expectAccessiblePage(page, true);
		await templates.scrollIntoViewIfNeeded();
		await templates.screenshot({
			path: testInfo.outputPath(`${theme}-settings-sponsor-editor.png`),
			animations: "disabled",
		});

		mockApi.seedCommerceRules([volumeRule]);
		mockApi.seedSponsorOffers([donationOffer]);
		await page.goto("/admin/settings/tribute/sponsor-offers");
		await setTheme(page, theme);
		const donation = page.getByRole("article", { name: donationOffer.title });
		await expectSecondaryFrame(donation);
		const donationFact = donation.locator('[data-ui="sponsor-donation-fact"]');
		await expectPrimaryFrame(donationFact);
		await expectAccessiblePage(page);
		await donationFact.screenshot({
			path: testInfo.outputPath(`${theme}-settings-donation-fact.png`),
			animations: "disabled",
		});

		await page.goto("/admin/settings/tribute/automation-rules");
		await setTheme(page, theme);
		await page.getByRole("button", { name: /Flexible sponsor donations/ }).click();
		const ruleDialog = page.getByRole("dialog", { name: "Edit automation rule" });
		const ruleFields = ruleDialog.locator('[data-ui="commerce-rule-fields"]');
		await expect(ruleFields).toHaveCount(3);
		for (const fieldGroup of await ruleFields.all()) {
			await expectTransparentBody(fieldGroup);
			await expectPrimaryFrame(fieldGroup.locator(".."));
		}
		const band = ruleDialog.getByRole("group", { name: "Band 1" });
		await expectSecondaryFrame(band);
		await expectSurfaceContract(band.getByLabel("Starts at"), {
			background: primary,
			border: edge(standaloneBorder),
			outline: noOutline(),
			boxShadow: "none",
			color: primaryText,
		});
		await expectAccessiblePage(page, true);
		await band.scrollIntoViewIfNeeded();
		await band.screenshot({
			path: testInfo.outputPath(`${theme}-settings-rule-editor.png`),
			animations: "disabled",
		});

		await page.goto("/admin/settings/content");
		await setTheme(page, theme);
		const variablesPanel = page
			.getByRole("heading", { name: "Variables for this message" })
			.locator("xpath=ancestor::section");
		await expectSecondaryFrame(
			variablesPanel.getByRole("button", { name: "Copy {{appName}}" }),
			secondaryIcon,
		);
		await expectAccessiblePage(page);
		await variablesPanel.scrollIntoViewIfNeeded();
		await variablesPanel.screenshot({
			path: testInfo.outputPath(`${theme}-settings-content-variables.png`),
			animations: "disabled",
		});

		for (const [route, intro] of [
			[
				"/admin/settings/pulse",
				"Choose from configured sources. Connections stay saved when inactive",
			],
		] as const) {
			await page.goto(route);
			await setTheme(page, theme);
			await expectTokenColor(page.getByText(intro), secondaryText);
		}
		await page.goto("/admin/settings/communication");
		await setTheme(page, theme);
		await expect(
			page.getByText("Each message opens the fields used by its actual destination", {
				exact: true,
			}),
		).toHaveCount(0);
		await expectTokenColor(page.getByRole("heading", { name: "Telegram" }), secondaryText);
		await expectTokenColor(
			page.getByRole("button", { name: /Welcome Message/ }).locator("small"),
			secondaryText,
		);
		await expectAccessiblePage(page);
		await page.screenshot({
			path: testInfo.outputPath(`${theme}-settings-communication.png`),
			animations: "disabled",
			fullPage: true,
		});
	});
}
