import AxeBuilder from "@axe-core/playwright";
import { assertNoHorizontalOverflow, expect, test } from "./fixtures/mock-api.ts";
import {
	expectActionErrorRevealed,
	placeCaretAtEnd,
	selectElementContents,
	sponsorDonationRule,
	sponsorMultiPeriodOffer,
	sponsorSubscriptionOffer,
	sponsorSubscriptionRule,
	submitEditor,
} from "./fixtures/tribute.ts";

test("admin creates a user-facing sponsor offer from an automation rule", async ({
	page,
	mockApi,
}, testInfo) => {
	mockApi.seedCommerceRules([sponsorSubscriptionRule()]);

	await page.goto("/admin/settings/tribute/sponsor-offers");
	await expect(page.getByRole("heading", { name: "Sponsor offers" })).toBeVisible();
	await page.getByRole("button", { name: "Create first offer" }).click();
	await expect(page.getByRole("heading", { name: "Create sponsor offer" })).toBeVisible();
	await page.getByLabel("Offer title").fill("Monthly sponsor access");
	await expect(page.getByLabel("Description").locator("p").first()).toHaveAttribute(
		"data-placeholder",
		"Enter the message shown under this offer",
	);
	await page.getByLabel("Description").fill("Automatic monthly support with extended access.");
	const publish = page.getByRole("switch", { name: "Publish this sponsor offer" });
	await expect(publish).toHaveAttribute("aria-disabled", "true");
	await expect(
		page.getByText(
			"Add a Tribute payment link for this subscription in Payment links before making it visible on Home",
			{ exact: true },
		),
	).toBeVisible();
	await publish.focus();
	await expect(publish).toBeFocused();
	await publish.press("Space");
	await expect(publish).not.toBeChecked();
	await expect(page.getByText("Payment options from Tribute", { exact: true })).toBeVisible();
	await expect(page.getByText(/user chooses one on the Tribute checkout screen/)).toBeVisible();
	await page.getByRole("checkbox", { name: "PREMIUM" }).check();
	const accessibilityByTheme: Array<{ theme: "light" | "dark"; serious: unknown[] }> = [];
	for (const colorScheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		await expect(
			page
				.getByRole("dialog", { name: "Create sponsor offer" })
				.getByText("Templates", { exact: true }),
		).toHaveCSS("color", colorScheme === "dark" ? "rgb(163, 163, 163)" : "rgb(69, 69, 69)");
		const accessibility = await new AxeBuilder({ page }).analyze();
		const serious = accessibility.violations.filter((violation) =>
			["serious", "critical"].includes(violation.impact ?? ""),
		);
		accessibilityByTheme.push({ theme: colorScheme, serious });
		await assertNoHorizontalOverflow(page);
		await page
			.getByRole("dialog", { name: "Create sponsor offer" })
			.screenshot({ path: testInfo.outputPath(`missing-destination-${colorScheme}.png`) });
	}
	expect(accessibilityByTheme.filter(({ serious }) => serious.length > 0)).toEqual([]);
	await page.getByRole("heading", { name: "Payment and access" }).click();
	const createRequest = page.waitForRequest(
		(request) =>
			request.method() === "POST" &&
			new URL(request.url()).pathname === "/api/debug/admin/commerce/offers",
	);
	await submitEditor(page.getByRole("dialog", { name: "Create sponsor offer" }));
	const createPayload = (await createRequest).postDataJSON();
	expect(createPayload.contentLocales.en.title).toBe("Monthly sponsor access");
	expect(createPayload.contentLocales.ru.title).toBe("Расширенный доступ");
	expect(createPayload.excludedRemnawaveTags).toEqual(["PREMIUM"]);

	await expect(page.getByRole("heading", { name: "Create sponsor offer" })).toHaveCount(0);
	const createdOffer = page.getByRole("article", { name: "Monthly sponsor access" });
	await expect(createdOffer).toBeVisible();
	await expect(createdOffer.getByText("Billed monthly", { exact: true })).toBeVisible();
	await expect(createdOffer.getByText("Billed yearly", { exact: true })).toBeVisible();
	await expect(createdOffer).toContainText("500");
	await expect(createdOffer).toContainText("3,500");
	await expect(createdOffer.locator("..").getByRole("button", { name: "Edit" })).toBeVisible();
	expect(mockApi.calls).toContain("POST /api/debug/admin/commerce/offers");
	await assertNoHorizontalOverflow(page);
});

test("admin offer preview uses the exact Home offer presentation", async ({
	page,
	mockApi,
}, testInfo) => {
	const offer = sponsorMultiPeriodOffer();
	mockApi.seedCommerceRules([sponsorSubscriptionRule()]);
	mockApi.seedSponsorOffers([offer]);
	mockApi.seedSponsorState({
		status: "no_access",
		accessLevel: "none",
		primaryAction: "choose_offer",
		paidExpiresAt: null,
		baseExpiresAt: null,
		currentOfferId: null,
		managementUrl: null,
		pendingCheckout: null,
		offers: [offer],
	});

	for (const colorScheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
		await page.goto("/admin/settings/tribute/sponsor-offers");
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		const adminPreview = page.getByRole("article", { name: offer.title });
		await expect(adminPreview).toBeVisible();
		await expect(adminPreview.getByRole("button", { name: "Continue in Tribute" })).toHaveAttribute(
			"aria-disabled",
			"true",
		);
		const adminText = await adminPreview.innerText();
		const adminStyles = await adminPreview.evaluate((element) => {
			const style = getComputedStyle(element);
			return {
				backgroundColor: style.backgroundColor,
				borderColor: style.borderColor,
				borderRadius: style.borderRadius,
				boxShadow: style.boxShadow,
				display: style.display,
				gap: style.gap,
				padding: style.padding,
			};
		});
		await adminPreview.screenshot({
			path: testInfo.outputPath(`offer-preview-admin-${colorScheme}.png`),
			animations: "disabled",
		});
		await assertNoHorizontalOverflow(page);

		await page.goto("/");
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		const homeOffer = page.getByRole("article", { name: offer.title });
		await expect(homeOffer).toBeVisible();
		await expect(
			homeOffer.getByRole("button", { name: "Continue in Tribute" }),
		).not.toHaveAttribute("aria-disabled", "true");
		expect(await homeOffer.innerText()).toBe(adminText);
		expect(
			await homeOffer.evaluate((element) => {
				const style = getComputedStyle(element);
				return {
					backgroundColor: style.backgroundColor,
					borderColor: style.borderColor,
					borderRadius: style.borderRadius,
					boxShadow: style.boxShadow,
					display: style.display,
					gap: style.gap,
					padding: style.padding,
				};
			}),
		).toEqual(adminStyles);
		const accessibility = await new AxeBuilder({ page }).analyze();
		expect(
			accessibility.violations.filter((violation) =>
				["serious", "critical"].includes(violation.impact ?? ""),
			),
		).toEqual([]);
		await homeOffer.screenshot({
			path: testInfo.outputPath(`offer-preview-home-${colorScheme}.png`),
			animations: "disabled",
		});
		await assertNoHorizontalOverflow(page);
	}

	expect(mockApi.unhandled).toEqual([]);
	expect(mockApi.consoleErrors).toEqual([]);
	expect(mockApi.pageErrors).toEqual([]);
	expect(mockApi.requestFailures).toEqual([]);
});

test("sponsor offer maps a stale missing-destination response to actionable copy", async ({
	page,
	mockApi,
}, testInfo) => {
	mockApi.seedCommerceRules([sponsorSubscriptionRule()]);
	mockApi.mock("POST", "/api/debug/admin/commerce/offers", {
		status: 422,
		body: {
			detail: {
				code: "tribute_subscription_destination_missing",
				message: "Tribute subscription destination is not configured",
			},
		},
	});

	await page.goto("/admin/settings/tribute/payment-links");
	await page
		.getByLabel("Supporter", { exact: true })
		.fill("https://t.me/tribute/app?startapp=subscription_12");
	await page.getByRole("button", { name: "Save payment links", exact: true }).click();
	await expect(page.getByText("Payment links saved", { exact: true })).toBeVisible();
	await page.goto("/admin/settings/tribute/sponsor-offers");
	await page.getByRole("button", { name: "Create first offer" }).click();
	await page.getByLabel("Offer title").fill("Monthly sponsor access");
	const publish = page.getByRole("switch", { name: "Publish this sponsor offer" });
	await expect(publish).not.toHaveAttribute("aria-disabled", "true");
	await publish.click();
	await submitEditor(page.getByRole("dialog", { name: "Create sponsor offer" }));

	const saveError = page.getByRole("alert").filter({
		hasText:
			"Add a Tribute payment link for this subscription in Payment links before making it visible on Home",
	});
	await expectActionErrorRevealed(saveError);
	const accessibility = await new AxeBuilder({ page }).analyze();
	const serious = accessibility.violations.filter((violation) =>
		["serious", "critical"].includes(violation.impact ?? ""),
	);
	expect(serious).toEqual([]);
	if (testInfo.project.name === "mobile-chromium") {
		await page
			.getByRole("dialog", { name: "Create sponsor offer" })
			.screenshot({ path: testInfo.outputPath("sponsor-offer-action-error-dark.png") });
	}
	await expect(page.getByText(/Could not save this sponsor offer/)).toHaveCount(0);
	await expect(page.getByLabel("Offer title")).toHaveValue("Monthly sponsor access");
});

test("formatted offer copy keeps one fixed toolbar and renders safely on Home", async ({
	page,
	mockApi,
}, testInfo) => {
	testInfo.setTimeout(60_000);
	const offer = {
		...sponsorSubscriptionOffer(),
		description: "Support keeps the service available",
	};
	mockApi.seedSettings({
		tributeSubscriptionUrls: {
			"12": "https://t.me/tribute/app?startapp=subscription_12",
		},
	});
	mockApi.seedCommerceRules([sponsorSubscriptionRule()]);
	mockApi.seedSponsorOffers([offer]);

	await page.goto("/admin/settings/tribute/sponsor-offers");
	await page
		.getByRole("article", { name: offer.title })
		.locator("..")
		.getByRole("button", { name: "Edit" })
		.click();
	const editor = page.getByRole("dialog", { name: "Edit sponsor offer" });
	const description = editor.getByLabel("Description");
	const templates = editor.locator("details").filter({ hasText: "Templates" });
	await expect(templates).not.toHaveAttribute("open", "");
	await templates.getByText("Templates", { exact: true }).click();
	await expect(templates.getByRole("button", { name: "Copy {{appName}}" })).toBeVisible();
	await expect(description).toHaveCSS("font-size", "13px");
	await placeCaretAtEnd(description);
	await description.press("Enter");
	await description.pressSequentially("Faster support");
	await description.press("Enter");
	await description.pressSequentially("More traffic");
	const formattingToolbar = page.getByRole("toolbar", { name: "Text formatting" });
	await expect(formattingToolbar).toBeVisible();
	await expect(formattingToolbar).toHaveAttribute("aria-controls", "sponsor-offer-description");
	await editor.screenshot({ path: testInfo.outputPath("formatted-offer-fixed-toolbar.png") });
	await selectElementContents(description.locator("p").first());
	const boldTool = formattingToolbar.getByRole("button", { name: "Bold" });
	await boldTool.click();
	await expect(description.locator("strong")).toHaveText("Support keeps the service available");

	await selectElementContents(description.locator("strong"));
	await boldTool.focus();
	await boldTool.press("ArrowRight");
	await expect(formattingToolbar.getByRole("button", { name: "Italic" })).toBeFocused();
	await selectElementContents(description);
	await formattingToolbar.getByRole("button", { name: "Bulleted list" }).click();
	await expect(description.getByRole("list")).toContainText("Faster support");

	await selectElementContents(description.locator("strong"));
	await formattingToolbar.getByRole("button", { name: "Add or edit link" }).click();
	const linkAddress = page.getByRole("textbox", { name: "Link address" });
	await expect(linkAddress).toHaveCSS("font-size", "13px");
	await linkAddress.fill("example.com/composing");
	await linkAddress.evaluate((element) =>
		element.dispatchEvent(
			new KeyboardEvent("keydown", {
				key: "Enter",
				isComposing: true,
				bubbles: true,
				cancelable: true,
			}),
		),
	);
	await expect(linkAddress).toBeFocused();
	await expect(description.getByRole("link")).toHaveCount(0);
	await linkAddress.fill("javascript:alert(1)");
	await page.getByRole("button", { name: "Apply link" }).click();
	await expect(page.getByRole("alert")).toHaveText("Enter a valid http or https address");
	await linkAddress.fill("example.com/sponsor");
	await linkAddress.press("Enter");
	await expect(
		description.getByRole("link", { name: "Support keeps the service available" }),
	).toHaveAttribute("href", "https://example.com/sponsor");
	await expect(description).toBeFocused();

	const accessibilityByTheme: Array<{ theme: "light" | "dark"; serious: unknown[] }> = [];
	for (const colorScheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		await expect(page.getByRole("main").locator(":scope > div")).toHaveCSS("opacity", "1");
		await expect(description.getByText("Faster support", { exact: true })).toHaveCSS(
			"color",
			colorScheme === "dark" ? "rgb(255, 255, 255)" : "rgb(23, 23, 23)",
		);
		const accessibility = await new AxeBuilder({ page }).analyze();
		const serious = accessibility.violations.filter((violation) =>
			["serious", "critical"].includes(violation.impact ?? ""),
		);
		accessibilityByTheme.push({ theme: colorScheme, serious });
		await assertNoHorizontalOverflow(page);
		await editor.screenshot({
			path: testInfo.outputPath(`formatted-offer-editor-${colorScheme}.png`),
		});
	}
	expect(accessibilityByTheme.filter(({ serious }) => serious.length > 0)).toEqual([]);
	await page.evaluate(() => {
		if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
	});
	await expect(editor.getByRole("button", { name: "Save offer" })).toHaveCount(0);

	const saveRequest = page.waitForRequest(
		(request) =>
			request.method() === "PUT" &&
			new URL(request.url()).pathname === `/api/debug/admin/commerce/offers/${offer.id}`,
	);
	await submitEditor(editor);
	const request = await saveRequest;
	const savedDescription = String(request.postDataJSON().description);
	expect(savedDescription).toContain("[**Support keeps the service available**]");
	expect(savedDescription).toContain("https://example.com/sponsor");
	expect(savedDescription).toContain("- Faster support");

	const formattedOffer = { ...offer, description: savedDescription };
	mockApi.seedSponsorState({
		status: "base_access",
		accessLevel: "base",
		primaryAction: "choose_offer",
		paidExpiresAt: null,
		baseExpiresAt: "2099-12-31T23:59:59Z",
		currentOfferId: null,
		managementUrl: null,
		pendingCheckout: null,
		offers: [formattedOffer],
	});
	await page.goto("/");
	const homeOffer = page.getByRole("article", { name: offer.title });
	await expect(homeOffer.locator("strong").filter({ hasText: "Support keeps" })).toBeVisible();
	await expect(
		homeOffer.getByRole("link", { name: "Support keeps the service available" }),
	).toHaveAttribute("href", "https://example.com/sponsor");
	await expect(homeOffer.getByRole("list").filter({ hasText: "More traffic" })).toBeVisible();
	await assertNoHorizontalOverflow(page);
	await page.screenshot({ path: testInfo.outputPath("formatted-offer-home-dark.png") });
});

test("admin can relink an existing sponsor offer to another automation rule", async ({
	page,
	mockApi,
}, testInfo) => {
	const currentRule = sponsorSubscriptionRule();
	const nextRule = {
		...currentRule,
		id: "10000000-0000-4000-8000-000000000099",
		name: "Believer benefits",
		accessProfileId: "00000000-0000-4000-8000-000000000002",
	};
	const offer = sponsorSubscriptionOffer();
	mockApi.seedSettings({
		tributeSubscriptionUrls: {
			"12": "https://t.me/tribute/app?startapp=subscription_12",
		},
	});
	mockApi.seedCommerceRules([currentRule, nextRule]);
	mockApi.seedSponsorOffers([offer]);
	const accessibilityByTheme: Array<{ theme: "light" | "dark"; serious: unknown[] }> = [];

	for (const colorScheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
		await page.goto("/admin/settings/tribute/sponsor-offers");
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		await page
			.getByRole("article", { name: offer.title })
			.locator("..")
			.getByRole("button", { name: "Edit" })
			.click();
		const themedEditor = page.getByRole("dialog", { name: "Edit sponsor offer" });
		const ruleSelect = themedEditor.getByLabel("Automation rule");
		await expect(ruleSelect).toBeEnabled();
		await ruleSelect.selectOption(nextRule.id);
		await expect(ruleSelect).toHaveValue(nextRule.id);
		await expect(
			themedEditor.getByText("A payment already started keeps the rule captured when it began", {
				exact: false,
			}),
		).toBeVisible();
		const accessibility = await new AxeBuilder({ page }).analyze();
		const serious = accessibility.violations.filter((violation) =>
			["serious", "critical"].includes(violation.impact ?? ""),
		);
		accessibilityByTheme.push({ theme: colorScheme, serious });
		await themedEditor.screenshot({
			path: testInfo.outputPath(`offer-rule-relink-${colorScheme}.png`),
		});
	}
	expect(accessibilityByTheme.filter(({ serious }) => serious.length > 0)).toEqual([]);

	const editor = page.getByRole("dialog", { name: "Edit sponsor offer" });
	const requestPromise = page.waitForRequest(
		(request) =>
			request.method() === "PUT" &&
			new URL(request.url()).pathname === `/api/debug/admin/commerce/offers/${offer.id}`,
	);
	await submitEditor(editor);
	const request = await requestPromise;
	expect(request.postDataJSON()).toMatchObject({ commerceRuleId: nextRule.id });
	await expect(page.getByRole("dialog", { name: "Edit sponsor offer" })).toHaveCount(0);
	await expect(
		page
			.getByRole("article", { name: offer.title })
			.locator("..")
			.getByText("Access: Believer benefits", { exact: true }),
	).toBeVisible();
	await assertNoHorizontalOverflow(page);
});

test("admin hides a published sponsor offer from its list toggle", async ({ page, mockApi }) => {
	mockApi.seedCommerceRules([sponsorSubscriptionRule()]);
	mockApi.seedSponsorOffers([sponsorSubscriptionOffer()]);

	await page.goto("/admin/settings/tribute/sponsor-offers");
	const visibility = page.getByRole("switch", {
		name: "Publish or hide Monthly sponsor access",
	});
	await expect(visibility).toBeChecked();
	const requestPromise = page.waitForRequest(
		(request) =>
			request.method() === "PUT" &&
			new URL(request.url()).pathname ===
				"/api/debug/admin/commerce/offers/30000000-0000-4000-8000-000000000001",
	);

	await visibility.click();
	const request = await requestPromise;

	expect(request.postDataJSON()).toMatchObject({ isPublished: false });
	await expect(visibility).not.toBeChecked();
	await expect(page.getByRole("alert")).toHaveCount(0);
});

test("admin groups legacy subscription cards around one readable plan preview", async ({
	page,
	mockApi,
}, testInfo) => {
	const sharedOffer = {
		...sponsorMultiPeriodOffer(),
		isPublished: false,
		availability: "draft",
	};
	mockApi.seedCommerceRules([sponsorSubscriptionRule()]);
	mockApi.seedSettings({
		tributeSubscriptionUrls: {
			"12": "https://t.me/tribute/app?startapp=subscription_12",
		},
	});
	mockApi.seedSponsorOffers([
		{ ...sharedOffer, title: "One month", id: "30000000-0000-4000-8000-000000000001" },
		{ ...sharedOffer, title: "Three months", id: "30000000-0000-4000-8000-000000000002" },
		{ ...sharedOffer, title: "One year", id: "30000000-0000-4000-8000-000000000003" },
	]);

	await page.goto("/admin/settings/tribute/sponsor-offers");
	const offersSection = page
		.getByRole("heading", { name: "Sponsor offers" })
		.locator("xpath=ancestor::section[1]");
	await expect(offersSection.getByText(/Some saved cards reuse/)).toBeVisible();
	await expect(offersSection.getByText("Billed monthly", { exact: true })).toHaveCount(1);
	await expect(offersSection.getByText("Billed every 3 months", { exact: true })).toHaveCount(1);
	await expect(offersSection.getByText("Billed yearly", { exact: true })).toHaveCount(1);
	await expect(offersSection.locator("details:not([open])")).toHaveCount(2);
	await expect(offersSection.getByRole("button", { name: "Edit" })).toHaveCount(1);

	const accessibilityByTheme: Array<{ theme: "light" | "dark"; serious: unknown[] }> = [];
	for (const colorScheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
		const warningSurface = colorScheme === "light" ? "rgb(255, 239, 204)" : "rgb(52, 45, 25)";
		const warningBorder = colorScheme === "light" ? "rgb(252, 218, 146)" : "rgb(99, 82, 29)";
		const warningText = colorScheme === "light" ? "rgb(138, 91, 0)" : "rgb(255, 203, 47)";
		const secondarySurface = colorScheme === "light" ? "rgb(242, 242, 242)" : "rgb(41, 41, 41)";
		const firstLegacyOffer = offersSection.locator('[data-ui="legacy-sponsor-offer"]').first();
		const duplicateNote = offersSection.getByRole("note");
		const duplicateWarning = offersSection.locator('[data-ui="duplicate-sponsor-warning"]').first();
		await firstLegacyOffer.locator("summary").click();
		await expect(offersSection.locator('[data-ui="duplicate-notice"]')).toHaveCSS(
			"background-color",
			"rgba(0, 0, 0, 0)",
		);
		await expect(duplicateNote).toHaveCSS("background-color", warningSurface);
		await expect(duplicateNote).toHaveCSS("border-color", warningBorder);
		await expect(duplicateNote).toHaveCSS("color", warningText);
		await expect(offersSection.locator('[data-ui="sponsor-offer-list"]')).toHaveCSS(
			"background-color",
			"rgba(0, 0, 0, 0)",
		);
		await expect(firstLegacyOffer).toHaveCSS("background-color", secondarySurface);
		await expect(duplicateWarning).toHaveCSS("background-color", warningSurface);
		await expect(duplicateWarning).toHaveCSS("border-color", warningBorder);
		await expect(duplicateWarning).toHaveCSS("color", warningText);
		await offersSection.screenshot({
			path: testInfo.outputPath(`admin-subscription-cards-${colorScheme}.png`),
		});
		const result = await new AxeBuilder({ page }).analyze();
		const serious = result.violations.filter((violation) =>
			["serious", "critical"].includes(violation.impact ?? ""),
		);
		accessibilityByTheme.push({ theme: colorScheme, serious });
		await assertNoHorizontalOverflow(page);
		await firstLegacyOffer.locator("summary").click();
	}
	expect(accessibilityByTheme.filter(({ serious }) => serious.length > 0)).toEqual([]);

	await offersSection.locator("details", { hasText: "Three months" }).locator("summary").click();
	await offersSection.locator("details", { hasText: "One year" }).locator("summary").click();
	await expect(offersSection.locator("details[open]")).toHaveCount(2);
	await expect(offersSection.getByRole("button", { name: "Edit" })).toHaveCount(3);
	const publishedToggle = offersSection.getByRole("switch", {
		name: "Publish or hide Three months",
	});
	await expect(publishedToggle).toBeEnabled();
	await publishedToggle.click();
	await expect(publishedToggle).toBeChecked();
	const oneMonthDetails = offersSection.locator("details", { hasText: "One month" });
	await oneMonthDetails.locator("summary").click();
	await expect(
		offersSection.getByRole("switch", { name: "Publish or hide One month" }),
	).toBeDisabled();
	const oneYearDetails = offersSection.locator("details", { hasText: "One year" });
	if (!(await oneYearDetails.evaluate((element) => (element as HTMLDetailsElement).open))) {
		await oneYearDetails.locator("summary").click();
	}
	await expect(
		offersSection.getByRole("switch", { name: "Publish or hide One year" }),
	).toBeDisabled();
	await expect(
		offersSection
			.getByRole("article", { name: "Three months" })
			.getByText("Billed monthly", { exact: true }),
	).toBeVisible();
	expect(mockApi.calls).toContain(
		"PUT /api/debug/admin/commerce/offers/30000000-0000-4000-8000-000000000002",
	);
});

test("admin publishes exact one-time and recurring donation choices from one rule", async ({
	page,
	mockApi,
}) => {
	mockApi.seedCommerceRules([sponsorDonationRule()]);

	await page.goto("/admin/settings/tribute/sponsor-offers");
	for (const [title, link, amount, mode, period] of [
		["One month sponsor", "https://t.me/tribute/app?startapp=month", "500", "one_time", null],
		["One year sponsor", "https://t.me/tribute/app?startapp=year", "3500", "recurring", "yearly"],
	] as const) {
		await page
			.getByRole("button", {
				name: title === "One month sponsor" ? "Create first offer" : "Add offer",
			})
			.click();
		await page.getByLabel("Offer title").fill(title);
		const donationLink = page.getByLabel("Tribute link for this offer");
		if (title === "One month sponsor") {
			await donationLink.fill("http://t.me/tribute/app?startapp=month");
			await expect(page.getByRole("alert")).toContainText("Use an HTTPS link");
			await expect(page.getByRole("switch", { name: "Publish this sponsor offer" })).toBeDisabled();
		}
		await donationLink.fill(link);
		await page.getByLabel("Amount the user must enter (RUB)").fill(amount);
		if (mode === "recurring" && period) {
			await page.getByRole("radio", { name: "Auto-donation" }).click();
			const frequency = page.getByLabel("Auto-donation frequency");
			expect(await frequency.locator("option").allTextContents()).toEqual([
				"week",
				"month",
				"3 months",
				"6 months",
				"year",
			]);
			await frequency.selectOption(period);
		}
		const publish = page.getByRole("switch", { name: "Publish this sponsor offer" });
		await expect(publish).toBeEnabled();
		await publish.click();
		const requestPromise = page.waitForRequest(
			(request) =>
				request.method() === "POST" &&
				new URL(request.url()).pathname === "/api/debug/admin/commerce/offers",
		);
		await submitEditor(page.getByRole("dialog", { name: "Create sponsor offer" }));
		const request = await requestPromise;
		const input = request.postDataJSON() as Record<string, unknown>;
		expect(input.checkoutUrl).toBe(link);
		expect(input.expectedAmountMinor).toBe(Number(amount) * 100);
		expect(input.expectedPaymentMode).toBe(mode);
		expect(input.expectedProviderPeriod).toBe(period);
		expect(input.commerceRuleId).toBe(sponsorDonationRule().id);
		await expect(page.getByText(title, { exact: true })).toBeVisible();
	}

	const offersSection = page
		.getByRole("heading", { name: "Sponsor offers" })
		.locator("xpath=ancestor::section[1]");
	await expect(
		offersSection.getByText("Access: Flexible sponsor donations", { exact: true }),
	).toHaveCount(2);
	await assertNoHorizontalOverflow(page);
});
