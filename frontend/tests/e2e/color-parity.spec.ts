import AxeBuilder from "@axe-core/playwright";
import { expect, mockData, test } from "./fixtures/mock-api.ts";

const expected = {
	light: {
		floor1: "rgb(255, 255, 255)",
		bgTertiary: "rgb(230, 230, 230)",
		bgQuaternary: "rgb(66, 66, 66)",
		borderPrimary: "rgb(69, 69, 69)",
		borderSecondary: "rgb(199, 199, 199)",
		borderTertiary: "rgb(230, 230, 230)",
		positive: "rgb(58, 177, 118)",
		positiveSurface: "rgb(241, 250, 245)",
		positiveActiveSurface: "rgb(232, 247, 240)",
		positiveBorder: "rgb(198, 237, 217)",
		secondarySurface: "rgb(242, 242, 242)",
		primaryText: "rgb(23, 23, 23)",
		secondaryText: "rgb(69, 69, 69)",
		warningSurface: "rgb(255, 239, 204)",
		warningBorder: "rgb(252, 218, 146)",
		warningText: "rgb(243, 171, 17)",
		negativePrimary: "rgb(248, 66, 53)",
		negativeText: "rgb(198, 53, 42)",
		staticWhite: "rgb(255, 255, 255)",
		glass: "rgba(255, 255, 255, 0.92)",
	},
	dark: {
		floor1: "rgb(33, 33, 33)",
		bgTertiary: "rgb(69, 69, 69)",
		bgQuaternary: "rgb(199, 199, 199)",
		borderPrimary: "rgb(163, 163, 163)",
		borderSecondary: "rgb(66, 66, 66)",
		borderTertiary: "rgb(37, 37, 37)",
		positive: "rgb(73, 221, 147)",
		positiveSurface: "rgb(24, 45, 34)",
		positiveActiveSurface: "rgb(24, 57, 41)",
		positiveBorder: "rgb(37, 96, 66)",
		secondarySurface: "rgb(41, 41, 41)",
		primaryText: "rgb(255, 255, 255)",
		secondaryText: "rgb(163, 163, 163)",
		warningSurface: "rgb(52, 45, 25)",
		warningBorder: "rgb(99, 82, 29)",
		warningText: "rgb(255, 203, 47)",
		negativePrimary: "rgb(248, 66, 53)",
		negativeText: "rgb(248, 66, 53)",
		staticWhite: "rgb(255, 255, 255)",
		glass: "rgba(33, 33, 33, 0.92)",
	},
} as const;

const sponsorOffer = {
	id: "30000000-0000-4000-8000-000000000001",
	title: "Sponsor access",
	description: "Support keeps the service available.",
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
	benefits: { trafficLimitBytes: 100 * 1024 ** 3, deviceLimit: 5 },
	availability: "ready",
	welcomeDiscount: true,
	welcomeDiscountPercent: 20,
};

const sponsorState = {
	status: "no_access",
	accessLevel: "none",
	primaryAction: "choose_offer",
	paidExpiresAt: null,
	baseExpiresAt: null,
	currentOfferId: null,
	managementUrl: null,
	pendingCheckout: null,
	offers: [sponsorOffer],
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

test("desktop color roles cover navigation, status, editors, and destructive actions", async ({
	page,
	mockApi,
}, testInfo) => {
	mockApi.mock("GET", "/api/me/subscription", {
		body: { ...mockData.subscription, status: "UNKNOWN", expiresAt: 4_102_444_799 },
	});
	mockApi.mock("GET", "/api/debug/admin/users/1", {
		body: {
			...mockData.adminUser,
			expireAt: new Date(Date.now() + 6.5 * 86_400_000).toISOString(),
		},
	});
	mockApi.mock("GET", "/api/debug/pulse", {
		body: {
			...mockData.pulse,
			overallStatus: "maintenance",
			groups: [
				{
					name: "Core",
					monitors: [
						{
							...mockData.pulse.groups[0].monitors[0],
							status: "maintenance",
							heartbeats: [
								{ status: 0, ping: 0 },
								{ status: 1, ping: 42 },
								{ status: 2, ping: 0 },
								{ status: 3, ping: 42 },
							],
						},
					],
				},
			],
		},
	});

	for (const colorScheme of ["light", "dark"] as const) {
		const colors = expected[colorScheme];
		mockApi.seedSponsorState(sponsorState);
		mockApi.seedCommerceRules([sponsorRule]);
		mockApi.seedSponsorOffers([sponsorOffer]);
		mockApi.mock("GET", "/api/me/sponsor", { delayMs: 2_000, body: sponsorState });
		await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
		await page.goto("/");
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		const sponsorLoading = page.locator('section[aria-label="Loading sponsor access"]');
		await expect(sponsorLoading).toBeVisible();
		await expect(sponsorLoading.locator('[data-ui="skeleton"]').first()).toHaveCSS(
			"background-color",
			colors.secondarySurface,
		);
		const unknown = page.getByText("Unknown status", { exact: true });
		await expect(unknown).toBeVisible();
		await expect(unknown).toHaveCSS("background-color", colors.secondarySurface);
		await expect(unknown).toHaveCSS("color", colors.secondaryText);
		await expect(unknown).toHaveCSS("border-color", colors.borderTertiary);
		await expect(unknown).toHaveCSS("border-style", "solid");
		await expect(page.locator('[data-ui="home-expiry-unlimited"]')).toHaveCSS(
			"color",
			colors.secondaryText,
		);

		const header = page.getByRole("banner");
		await expect(header).toHaveCSS("background-color", colors.glass);
		const logoRects = header.locator("svg").first().locator("rect");
		await expect(logoRects.nth(0)).toHaveCSS(
			"fill",
			colorScheme === "light" ? "rgb(23, 23, 23)" : colors.staticWhite,
		);
		await expect(logoRects.nth(2)).toHaveCSS("fill", colors.secondaryText);
		await expect(logoRects.nth(6)).toHaveCSS("fill", colors.positive);

		const navigation = page.getByRole("navigation");
		await expect(navigation).toHaveCSS("background-color", colors.glass);
		for (const property of ["backgroundColor", "borderColor", "boxShadow"] as const) {
			const headerValue = await header.evaluate(
				(element, cssProperty) => getComputedStyle(element)[cssProperty],
				property,
			);
			await expect
				.poll(() =>
					navigation.evaluate(
						(element, cssProperty) => getComputedStyle(element)[cssProperty],
						property,
					),
				)
				.toBe(headerValue);
		}
		const navigationContrast = await new AxeBuilder({ page })
			.include("nav")
			.withRules(["color-contrast"])
			.analyze();
		expect(navigationContrast.violations).toEqual([]);
		const home = navigation.getByRole("link", { name: "Home" });
		await expect(home).toHaveCSS("color", colors.positive);
		const selectedSurface = await home.evaluate(
			(element) => getComputedStyle(element, "::before").backgroundColor,
		);
		expect(selectedSurface).toBe(colors.positiveSurface);
		const sponsorOption = page.getByRole("article", { name: "Sponsor access" });
		await page.mouse.move(0, 0);
		await expect(sponsorOption).toHaveCSS("background-color", colors.floor1);
		await expect(sponsorOption).toHaveCSS("border-color", colors.positiveBorder);
		await expect(sponsorOption).toHaveCSS("box-shadow", `${colors.positive} 3px 0px 0px 0px inset`);
		const discount = sponsorOption.locator('[data-ui="welcome-discount"]');
		await expect(discount).toHaveCSS("background-color", colors.secondarySurface);
		await expect(discount).toHaveCSS("border-color", colors.positiveBorder);
		await expect(discount).toHaveCSS("color", colors.primaryText);
		const discountIconWrapper = discount.locator('[data-ui="welcome-discount-icon"]');
		await expect(discountIconWrapper).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
		await expect(discountIconWrapper).toHaveCSS("border-style", "none");
		await expect(discountIconWrapper).toHaveCSS("box-shadow", "none");
		await expect(discountIconWrapper).toHaveCSS("color", colors.positive);
		const discountIcon = discount.locator('[data-ui="welcome-discount-ticket-icon"]');
		await expect(discountIcon).toHaveClass(/lucide-ticket-percent/);
		await expect(discountIcon).toHaveAttribute("width", "20");
		await expect(discountIcon).toHaveAttribute("height", "20");
		const priceList = sponsorOption.getByRole("list", {
			name: "Payment options from Tribute",
		});
		await expect(priceList).toHaveCSS("background-color", colors.secondarySurface);
		await expect(priceList).toHaveCSS("border-color", colors.borderSecondary);
		if (testInfo.project.name === "desktop-chromium") {
			await sponsorOption.hover();
			await expect(sponsorOption).toHaveCSS("border-color", colors.positiveBorder);
			const pulse = navigation.getByRole("link", { name: "Pulse" });
			await pulse.hover();
			await expect(pulse).toHaveCSS("background-color", colors.secondarySurface);
			await home.hover();
			await expect
				.poll(() =>
					home.evaluate((element) => getComputedStyle(element, "::before").backgroundColor),
				)
				.toBe(colors.positiveActiveSurface);
		}
		await page.screenshot({
			path: testInfo.outputPath(`home-desktop-colors-${colorScheme}.png`),
			animations: "disabled",
		});

		await page.goto("/pulse");
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		const maintenance = page.getByText("Scheduled maintenance", { exact: true }).locator("..");
		await expect(maintenance).toHaveCSS("background-color", colors.warningSurface);
		await expect(maintenance).toHaveCSS("border-color", colors.warningBorder);
		await expect(maintenance).toHaveCSS("color", colors.warningText);
		const monitor = page.locator('[data-monitor-status="maintenance"]');
		await expect(monitor.locator('[data-monitor-status-dot="maintenance"]')).toHaveCSS(
			"background-color",
			colors.warningText,
		);
		await expect(monitor.locator('[data-heartbeat-status="empty"]').first()).toHaveCSS(
			"background-color",
			colors.bgTertiary,
		);
		await expect(monitor.locator('[data-heartbeat-status="up"]')).toHaveCSS(
			"background-color",
			colors.positive,
		);
		await expect(monitor.locator('[data-heartbeat-status="down"]')).toHaveCSS(
			"background-color",
			colors.negativePrimary,
		);
		for (const status of ["pending", "maintenance"] as const) {
			await expect(monitor.locator(`[data-heartbeat-status="${status}"]`)).toHaveCSS(
				"background-color",
				colors.warningText,
			);
		}
		await page.screenshot({
			path: testInfo.outputPath(`pulse-maintenance-${colorScheme}.png`),
			animations: "disabled",
		});

		await page.goto("/admin/dashboard");
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		const activeDashboardTab = page.getByRole("tab", { name: "Remnawave" });
		await expect(activeDashboardTab).toHaveCSS("color", colors.positive);
		const segmentedTrack = activeDashboardTab.locator("..");
		await expect(segmentedTrack).toHaveCSS("background-color", colors.floor1);
		await expect(segmentedTrack).toHaveCSS("border-color", colors.borderTertiary);
		const segmentedSelection = await segmentedTrack.evaluate(
			(element) => getComputedStyle(element, "::before").backgroundColor,
		);
		expect(segmentedSelection).toBe(colors.positiveActiveSurface);

		await page.goto("/admin/users/1");
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		await expect(page.locator('[data-expiry-tone="warning"]')).toHaveCSS(
			"color",
			colors.warningText,
		);

		mockApi.mock("GET", "/api/me/devices", { body: mockData.devices });
		await page.goto("/devices");
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		await page.getByRole("button", { name: "Delete device" }).first().click();
		const dialog = page.getByRole("alertdialog", { name: "Remove device?" });
		const remove = dialog.getByRole("button", { name: "Remove", exact: true });
		await expect(remove).toHaveCSS("background-color", colors.negativePrimary);
		await expect(remove).toHaveCSS("color", colors.staticWhite);
		await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
		mockApi.mock("GET", "/api/me/devices", {
			status: 502,
			body: { detail: "Provider unavailable" },
		});
		await page.reload();
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		const errorState = page.getByRole("alert");
		await expect(errorState.getByRole("heading", { name: "Unable to load data" })).toHaveCSS(
			"color",
			colors.negativeText,
		);
		await expect(errorState.locator("svg").first()).toHaveCSS("color", colors.negativeText);

		await page.goto("/admin/settings/tribute/referral-benefits");
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		const notice = page.getByRole("note").filter({ hasText: "The two benefits are independent" });
		await expect(notice).toHaveCSS("background-color", colors.warningSurface);
		await expect(notice).toHaveCSS("border-color", colors.warningBorder);
		const toggle = page.getByRole("switch", { name: "Enable inviter reward days" });
		await expect(toggle).toHaveCSS("background-color", colors.secondarySurface);
		await expect(toggle).toHaveCSS("border-color", colors.borderSecondary);
		await expect(toggle.locator("span")).toHaveCSS("background-color", colors.bgQuaternary);
		if (testInfo.project.name === "desktop-chromium") {
			await toggle.hover();
			await expect(toggle).toHaveCSS("border-color", colors.borderPrimary);
		}
		if (testInfo.project.name === "mobile-chromium") {
			await page.screenshot({
				path: testInfo.outputPath(`referral-desktop-colors-${colorScheme}.png`),
				animations: "disabled",
			});
		}
		await toggle.click();
		await expect(toggle).toHaveCSS("background-color", colors.positive);
		await expect(toggle.locator("span")).toHaveCSS("background-color", colors.staticWhite);

		await page.goto("/admin/settings/tribute/automation-rules");
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		await expect(page.getByText("Map payments to access").locator("..")).toHaveCSS(
			"background-color",
			colors.floor1,
		);
		if (testInfo.project.name === "mobile-chromium") {
			await page.screenshot({
				path: testInfo.outputPath(`commerce-intro-desktop-colors-${colorScheme}.png`),
				animations: "disabled",
			});
		}

		await page.goto("/admin/settings/tribute/sponsor-offers");
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		const publishedSponsorOffer = page.getByRole("article", { name: sponsorOffer.title });
		await expect(publishedSponsorOffer).toHaveCSS("border-color", colors.positiveBorder);
		await expect(publishedSponsorOffer).toHaveCSS(
			"box-shadow",
			`${colors.positive} 3px 0px 0px 0px inset`,
		);
		const adminPriceList = publishedSponsorOffer.getByRole("list", {
			name: "Payment options from Tribute",
		});
		await expect(adminPriceList).toHaveCSS("background-color", colors.floor1);
		await expect(adminPriceList).toHaveCSS("border-color", colors.borderTertiary);
		await publishedSponsorOffer.getByRole("button", { name: "Edit" }).click();
		const offerEditor = page.getByRole("dialog", { name: "Edit sponsor offer" });
		const templates = offerEditor.locator("details").filter({ hasText: "Templates" });
		await expect(templates).toHaveCSS("background-color", colors.floor1);
		const formattedDescription = offerEditor.getByRole("textbox", { name: "Description" });
		await formattedDescription.focus();
		await expect(formattedDescription).toHaveCSS("color", colors.primaryText);
		const formattedEditor = page.locator('[data-ui="formatted-text-editor"]');
		await expect(formattedEditor).toHaveCSS("border-color", colors.positiveBorder);
		await expect(formattedEditor).toHaveCSS("box-shadow", "none");
		if (testInfo.project.name === "mobile-chromium") {
			await offerEditor.screenshot({
				path: testInfo.outputPath(`sponsor-editor-desktop-colors-${colorScheme}.png`),
				animations: "disabled",
			});
		}

		await page.goto("/admin/settings/tribute/payment-links");
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		const save = page.getByRole("button", { name: "Save payment links", exact: true });
		await expect(save).toBeDisabled();
		await expect(save).toHaveCSS(
			"background-color",
			colorScheme === "light" ? "rgb(23, 23, 23)" : colors.staticWhite,
		);
		await expect(save).toHaveCSS(
			"color",
			colorScheme === "light" ? colors.staticWhite : "rgb(23, 23, 23)",
		);
		const subscriptionLink = page.getByLabel("Supporter");
		await subscriptionLink.focus();
		await expect(subscriptionLink).toHaveCSS("border-color", colors.positiveBorder);
		await expect(subscriptionLink).toHaveCSS("box-shadow", "none");

		const pendingSponsorState = {
			...sponsorState,
			status: "checkout_pending",
			primaryAction: "continue_checkout",
			pendingCheckout: {
				id: "40000000-0000-4000-8000-000000000001",
				offerId: sponsorOffer.id,
				status: "pending",
				checkoutUrl: sponsorOffer.checkoutUrl,
				expiresAt: "2026-08-23T12:30:00Z",
			},
		};
		mockApi.seedSponsorState(pendingSponsorState);
		mockApi.mock("GET", "/api/me/sponsor", { body: pendingSponsorState });
		await page.goto("/");
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		await page.getByRole("button", { name: "Check payment status" }).click();
		const checkedStatus = page.getByRole("status").filter({ hasText: "Checked just now" });
		await expect(checkedStatus).toHaveCSS("background-color", colors.floor1);
		await expect(checkedStatus).toHaveCSS("border-color", colors.borderTertiary);
		await expect(checkedStatus).toHaveCSS("color", colors.secondaryText);
	}
});

test("prefers-color-scheme selects the desktop token values before data-theme", async ({
	page,
	mockApi: _mock,
}) => {
	for (const colorScheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
		await page.goto("/");
		await expect(page.getByRole("main").locator(":scope > div")).toHaveCSS("opacity", "1");
		const values = await page.evaluate(() => {
			document.documentElement.removeAttribute("data-theme");
			const style = getComputedStyle(document.documentElement);
			return {
				floor1: style.getPropertyValue("--v2-floor-1").trim(),
				positive: style.getPropertyValue("--v2-bg-positive-primary").trim(),
				warning: style.getPropertyValue("--v2-bg-warning").trim(),
			};
		});
		expect(values).toEqual(
			colorScheme === "light"
				? { floor1: "#ffffff", positive: "#3ab176", warning: "#ffefcc" }
				: { floor1: "#212121", positive: "#49dd93", warning: "#342d19" },
		);
	}
});
