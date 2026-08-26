import AxeBuilder from "@axe-core/playwright";
import { assertNoHorizontalOverflow, expect, mockData, test } from "./fixtures/mock-api.ts";
import {
	expectActionErrorRevealed,
	sponsorDonationOffer,
	sponsorDonationRule,
	sponsorMultiPeriodOffer,
	sponsorSubscriptionOffer,
	sponsorYearlySubscriptionOffer,
} from "./fixtures/tribute.ts";

test("Home starts a subscription checkout without treating the redirect as payment proof", async ({
	page,
	mockApi,
}) => {
	const offer = sponsorSubscriptionOffer("https://checkout.example.test/tribute/monthly");
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
	await page.route("https://checkout.example.test/**", (route) =>
		route.fulfill({ status: 200, contentType: "text/html", body: "Tribute checkout" }),
	);
	mockApi.mock("GET", "/api/me/subscription", {
		status: 404,
		body: { detail: "No subscription" },
	});

	await page.goto("/");
	await expect(page.getByRole("article", { name: "No active subscription" })).toBeVisible();
	await expect(page.getByRole("heading", { name: "Get extended access" })).toBeVisible();
	const subscriptionOffer = page.getByRole("article", { name: "Monthly sponsor access" });
	await expect(subscriptionOffer).toBeVisible();
	await expect(subscriptionOffer.getByText("Billed monthly", { exact: true })).toBeVisible();
	await expect(subscriptionOffer).toContainText("500");
	await expect(subscriptionOffer).toContainText(
		"Prices and billing intervals come from Tribute. Choose the payment option there",
	);
	const requestPromise = page.waitForRequest(
		(request) =>
			request.method() === "POST" &&
			new URL(request.url()).pathname === "/api/me/sponsor/checkouts",
	);
	await subscriptionOffer.getByRole("button", { name: "Continue in Tribute" }).click();
	const request = await requestPromise;
	expect(request.postDataJSON()).toEqual({ offerId: offer.id });
	expect(mockApi.calls).toContain("POST /api/me/sponsor/checkouts");
});

test("Home labels the eligible subscription as a welcome discount", async ({
	page,
	mockApi,
}, testInfo) => {
	const offer = {
		...sponsorSubscriptionOffer(),
		welcomeDiscount: true,
		welcomeDiscountPercent: 25,
		priceOptions: [
			{ priceMajor: "500", currency: "RUB", period: "monthly" },
			{ priceMajor: "5000", currency: "RUB", period: "annually" },
		],
	};
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
	mockApi.mock("GET", "/api/me/subscription", {
		status: 404,
		body: { detail: "No subscription" },
	});
	const accessibilityByTheme: Array<{ theme: "light" | "dark"; serious: unknown[] }> = [];

	for (const colorScheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
		await page.goto("/");
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		const subscriptionOffer = page.getByRole("article", { name: "Monthly sponsor access" });
		await expect(page.getByRole("main").locator(":scope > div")).toHaveCSS("opacity", "1");
		const discount = subscriptionOffer.locator('[data-ui="welcome-discount"]');
		await expect(discount).toBeVisible();
		const expectedColors =
			colorScheme === "light"
				? {
						primary: "rgb(255, 255, 255)",
						primaryText: "rgb(23, 23, 23)",
						secondary: "rgb(242, 242, 242)",
						secondaryText: "rgb(69, 69, 69)",
						secondaryBorder: "rgb(199, 199, 199)",
						positive: "rgb(36, 120, 79)",
						positiveBorder: "rgb(198, 237, 217)",
					}
				: {
						primary: "rgb(33, 33, 33)",
						primaryText: "rgb(255, 255, 255)",
						secondary: "rgb(41, 41, 41)",
						secondaryText: "rgb(163, 163, 163)",
						secondaryBorder: "rgb(66, 66, 66)",
						positive: "rgb(73, 221, 147)",
						positiveBorder: "rgb(37, 96, 66)",
					};
		await expect(subscriptionOffer).toHaveCSS("background-color", expectedColors.primary);
		await expect(discount).toHaveCSS("background-color", expectedColors.secondary);
		await expect(discount).toHaveCSS("border-color", expectedColors.positiveBorder);
		await expect(discount.getByText("25% off your first payment")).toHaveCSS(
			"color",
			expectedColors.primaryText,
		);
		const discountIconWrapper = discount.locator('[data-ui="welcome-discount-icon"]');
		await expect(discountIconWrapper).toHaveCSS("color", expectedColors.positive);
		await expect(discountIconWrapper).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
		await expect(discountIconWrapper).toHaveCSS("border-style", "none");
		await expect(discountIconWrapper).toHaveCSS("box-shadow", "none");
		const discountIcon = discount.locator('[data-ui="welcome-discount-ticket-icon"]');
		await expect(discountIcon).toHaveClass(/lucide-ticket-percent/);
		await expect(discountIcon).toHaveAttribute("width", "20");
		await expect(discountIcon).toHaveAttribute("height", "20");
		const priceList = subscriptionOffer.getByRole("list", {
			name: "Payment options from Tribute",
		});
		await expect(priceList).toHaveCSS("background-color", expectedColors.secondary);
		await expect(priceList).toHaveCSS("border-color", expectedColors.secondaryBorder);
		await expect(priceList.locator("del").first()).toHaveCSS("color", expectedColors.secondaryText);
		await expect(subscriptionOffer.locator("del")).toHaveCount(2);
		const monthlyPrice = priceList.getByRole("listitem").nth(0);
		const yearlyPrice = priceList.getByRole("listitem").nth(1);
		await expect(monthlyPrice.locator("del")).toContainText("500");
		await expect(monthlyPrice.locator("strong")).toContainText("375");
		await expect(yearlyPrice.locator("del")).toContainText("5,000");
		await expect(yearlyPrice.locator("strong")).toContainText("3,750");
		await expect(
			subscriptionOffer.getByRole("button", { name: "Get 25% off in Tribute" }),
		).toBeVisible();
		await assertNoHorizontalOverflow(page);
		const accessibility = await new AxeBuilder({ page }).analyze();
		accessibilityByTheme.push({
			theme: colorScheme,
			serious: accessibility.violations.filter((violation) =>
				["serious", "critical"].includes(violation.impact ?? ""),
			),
		});
		await subscriptionOffer.screenshot({
			path: testInfo.outputPath(`welcome-discount-${colorScheme}.png`),
		});
	}
	expect(accessibilityByTheme.filter(({ serious }) => serious.length > 0)).toEqual([]);
});

test("Home reports confirmed subscription access without guessing cancellation state", async ({
	page,
	mockApi,
}, testInfo) => {
	const offer = sponsorSubscriptionOffer();
	const yearlyOffer = sponsorYearlySubscriptionOffer();
	const donationOffer = sponsorDonationOffer();
	mockApi.seedSettings({ appName: "Northstar Proxy" });
	mockApi.seedSponsorState({
		status: "recurring_active",
		accessLevel: "paid",
		primaryAction: "manage_subscription",
		paidExpiresAt: "2026-09-14T10:00:00Z",
		baseExpiresAt: null,
		currentOfferId: offer.id,
		managementUrl: "https://t.me/tribute",
		pendingCheckout: null,
		offers: [offer, yearlyOffer, donationOffer],
	});

	await page.goto("/");
	const activeCard = page.getByRole("region", { name: "Extended access is active" });
	await expect(activeCard).toBeVisible();
	await expect(
		activeCard.getByText(
			"Your paid access is available until the date below. Billing and cancellation are managed in Tribute",
		),
	).toBeVisible();
	await expect(
		activeCard.getByText(
			"If you cancel in Tribute, Northstar Proxy will update this card when the paid period ends and Tribute sends the change",
		),
	).toBeVisible();
	await expect(page.getByRole("button", { name: "Manage in Tribute" })).toBeVisible();
	await expect(page.getByText("Monthly sponsor access", { exact: true })).toHaveCount(0);
	await expect(page.getByRole("heading", { name: "Other subscription options" })).toBeVisible();
	await expect(
		page.getByText(
			"You can choose another subscription after your current paid period ends on Sep 14, 2026",
		),
	).toBeVisible();
	const yearlyOfferCard = page.getByRole("article", { name: "Yearly sponsor access" });
	const yearlyButton = yearlyOfferCard.getByRole("button", {
		name: "Available after current period",
	});
	await expect(yearlyButton).toBeDisabled();
	await expect(yearlyButton).toHaveAttribute("aria-describedby", "other-subscriptions-warning");
	await expect(yearlyOfferCard.getByText(/off your first payment/)).toHaveCount(0);
	await expect(yearlyOfferCard.locator('[data-ui="welcome-discount"]')).toHaveCount(0);
	await expect(yearlyOfferCard.locator("del")).toHaveCount(0);
	await expect(page.getByText("One month sponsor", { exact: true })).toHaveCount(0);
	await yearlyButton.evaluate((element) => (element as HTMLButtonElement).click());
	expect(mockApi.calls).not.toContain("POST /api/me/sponsor/checkouts");
	const accessibilityByTheme: Array<{ theme: "light" | "dark"; serious: unknown[] }> = [];
	for (const colorScheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		await expect(yearlyOfferCard).toHaveCSS(
			"border-color",
			colorScheme === "light" ? "rgb(230, 230, 230)" : "rgb(37, 37, 37)",
		);
		await expect(yearlyOfferCard).toHaveCSS(
			"background-color",
			colorScheme === "light" ? "rgb(242, 242, 242)" : "rgb(41, 41, 41)",
		);
		await expect(yearlyOfferCard).toHaveCSS("box-shadow", "none");
		await yearlyOfferCard.scrollIntoViewIfNeeded();
		await yearlyOfferCard.screenshot({
			path: testInfo.outputPath(`subscription-alternatives-${colorScheme}.png`),
		});
		const activeResult = await new AxeBuilder({ page }).analyze();
		const activeSerious = activeResult.violations.filter((violation) =>
			["serious", "critical"].includes(violation.impact ?? ""),
		);
		accessibilityByTheme.push({ theme: colorScheme, serious: activeSerious });
		await assertNoHorizontalOverflow(page);
	}
	expect(accessibilityByTheme.filter(({ serious }) => serious.length > 0)).toEqual([]);
	await yearlyButton.scrollIntoViewIfNeeded();
	await expect(yearlyButton).toBeInViewport();

	mockApi.seedSponsorState({
		status: "recurring_cancelled_active",
		accessLevel: "paid",
		primaryAction: "resume_recurring",
		paidExpiresAt: "2026-09-14T10:00:00Z",
		baseExpiresAt: null,
		currentOfferId: offer.id,
		managementUrl: null,
		pendingCheckout: null,
		offers: [offer],
	});
	await page.reload();
	await expect(page.getByRole("heading", { name: "Auto-renewal is off" })).toBeVisible();
	await expect(page.getByText("Sep 14, 2026", { exact: true })).toBeVisible();
	await expect(page.getByRole("button", { name: "Resume extended access" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Manage in Tribute" })).toHaveCount(0);
	await page.getByRole("button", { name: "Resume extended access" }).click();
	await expect(page.getByText("Monthly sponsor access", { exact: true })).toBeVisible();
	await assertNoHorizontalOverflow(page);
});

test("Home derives recurring billing UX from a recurring donation webhook lifecycle", async ({
	page,
	mockApi,
}) => {
	const offer = sponsorDonationOffer();
	mockApi.seedSettings({ appName: "Northstar Proxy" });
	mockApi.seedSponsorState({
		status: "recurring_donation_active",
		accessLevel: "paid",
		primaryAction: "manage_auto_donation",
		paidExpiresAt: "2026-09-14T10:00:00Z",
		baseExpiresAt: "2027-01-01T00:00:00Z",
		currentOfferId: offer.id,
		managementUrl: "https://t.me/tribute",
		pendingCheckout: null,
		offers: [offer],
	});

	await page.goto("/");
	await expect(page.getByRole("heading", { name: "Extended access is active" })).toBeVisible();
	await expect(page.getByText("Your paid access is available until the date below")).toBeVisible();
	await expect(
		page.getByText(
			"If you turn off auto-donation, Northstar Proxy will reflect the change when the paid period ends",
		),
	).toBeVisible();
	await expect(page.getByRole("button", { name: "Manage auto-donation in Tribute" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Extend access" })).toHaveCount(0);
	await expect(page.getByText("One month sponsor", { exact: true })).toHaveCount(0);
	const recurringHeartColor = await page
		.locator('[data-active="true"]')
		.evaluate((element) => getComputedStyle(element).color);
	const inactiveIconColor = await page
		.getByText(/^Registered through your invite:/)
		.locator("..")
		.evaluate((element) => getComputedStyle(element).color);
	expect(recurringHeartColor).not.toBe(inactiveIconColor);

	mockApi.seedSponsorState({
		status: "recurring_expired",
		accessLevel: "base",
		primaryAction: "resume_recurring",
		paidExpiresAt: null,
		baseExpiresAt: "2027-01-01T00:00:00Z",
		currentOfferId: offer.id,
		managementUrl: null,
		pendingCheckout: null,
		offers: [offer],
	});
	await page.reload();
	await expect(page.getByRole("heading", { name: "Recurring access ended" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Resume extended access" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Manage auto-donation in Tribute" })).toHaveCount(
		0,
	);
	await expect(page.getByRole("button", { name: "Extend access" })).toHaveCount(0);
	await page.getByRole("button", { name: "Resume extended access" }).click();
	await expect(page.getByText("One month sponsor", { exact: true })).toBeVisible();
	await assertNoHorizontalOverflow(page);
});

test("Home keeps base access while offering an upgrade and handles one-time renewal separately", async ({
	page,
	mockApi,
}) => {
	const offer = sponsorSubscriptionOffer();
	const donationOffer = sponsorDonationOffer();
	mockApi.seedSponsorState({
		status: "base_access",
		accessLevel: "base",
		primaryAction: "choose_offer",
		paidExpiresAt: null,
		baseExpiresAt: "2099-12-31T23:59:59Z",
		currentOfferId: null,
		managementUrl: null,
		pendingCheckout: null,
		offers: [offer, donationOffer],
	});

	await page.goto("/");
	await expect(page.getByText("Primary", { exact: true })).toBeVisible();
	await expect(page.getByRole("heading", { name: "Upgrade your access" })).toBeVisible();
	await expect(page.getByText("Basic access", { exact: true })).toBeVisible();
	await expect(page.getByText("No expiry", { exact: true })).toBeVisible();
	await expect(page.getByText("Jan 1, 2100", { exact: true })).toHaveCount(0);
	await expect(page.getByText("Monthly sponsor access", { exact: true })).toBeVisible();

	mockApi.seedSponsorState({
		status: "one_time_active",
		accessLevel: "paid",
		primaryAction: "renew",
		paidExpiresAt: "2026-09-14T10:00:00Z",
		baseExpiresAt: "2027-01-01T00:00:00Z",
		currentOfferId: offer.id,
		managementUrl: null,
		pendingCheckout: null,
		offers: [offer],
	});
	await page.reload();
	await expect(page.getByRole("heading", { name: "Extended access is active" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Extend access" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Manage in Tribute" })).toHaveCount(0);
	await expect(page.getByText("Monthly sponsor access", { exact: true })).toHaveCount(0);
	await page.getByRole("button", { name: "Extend access" }).click();
	await expect(page.getByText("Monthly sponsor access", { exact: true })).toBeVisible();
});

test("Home keeps offer choice available only while provider confirmation is pending", async ({
	page,
	mockApi,
}) => {
	const offer = sponsorSubscriptionOffer();
	const donationOffer = sponsorDonationOffer();
	mockApi.seedSponsorState({
		status: "checkout_pending",
		accessLevel: "base",
		primaryAction: "continue_checkout",
		paidExpiresAt: null,
		baseExpiresAt: "2027-01-01T00:00:00Z",
		currentOfferId: null,
		managementUrl: null,
		pendingCheckout: {
			id: "40000000-0000-4000-8000-000000000001",
			offerId: offer.id,
			status: "pending",
			checkoutUrl: offer.checkoutUrl,
			expiresAt: "2026-08-14T12:30:00Z",
		},
		offers: [offer, donationOffer],
	});

	await page.goto("/");
	const pendingCard = page.getByRole("region", { name: "Payment not confirmed yet" });
	await expect(pendingCard).toBeVisible();
	const checkPayment = pendingCard.getByRole("button", { name: "Check payment status" });
	const continuePayment = pendingCard.getByRole("button", { name: "Continue in Tribute" });
	const cancelPayment = pendingCard.getByRole("button", { name: "Cancel this attempt" });
	await expect(checkPayment).toBeVisible();
	await expect(continuePayment).toBeVisible();
	await expect(cancelPayment).toBeVisible();
	expect(
		(await pendingCard.getByRole("button").allTextContents())
			.slice(0, 3)
			.map((label) => label.trim()),
	).toEqual(["Check payment status", "Continue in Tribute", "Cancel this attempt"]);
	expect(
		await checkPayment.evaluate((element) => getComputedStyle(element).backgroundColor),
	).not.toBe("rgba(0, 0, 0, 0)");
	await expect(continuePayment).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
	await expect(cancelPayment).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
	const pendingActionsAccessibility = await new AxeBuilder({ page })
		.include('[data-ui="pending-checkout-actions"]')
		.analyze();
	expect(
		pendingActionsAccessibility.violations.filter((violation) =>
			["serious", "critical"].includes(violation.impact ?? ""),
		),
	).toEqual([]);
	await expect(page.getByRole("article", { name: "Monthly sponsor access" })).toHaveCount(0);
	const alternativeOffer = page.getByRole("article", { name: "One month sponsor" });
	await expect(alternativeOffer).toBeVisible();
	await expect(alternativeOffer.getByText("100 GB", { exact: true })).toBeVisible();
	await expect(alternativeOffer.getByText("5", { exact: true })).toBeVisible();

	mockApi.seedSponsorState({
		status: "provisioning",
		accessLevel: "base",
		primaryAction: "refresh",
		paidExpiresAt: null,
		baseExpiresAt: "2027-01-01T00:00:00Z",
		currentOfferId: null,
		managementUrl: null,
		pendingCheckout: null,
		offers: [offer],
	});
	await page.reload();
	await expect(page.getByRole("heading", { name: "Payment received" })).toBeVisible();
	await expect(page.getByText(/You do not need to pay again/)).toBeVisible();
	await expect(page.getByRole("button", { name: "Refresh status" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Continue in Tribute" })).toHaveCount(0);

	mockApi.seedSponsorState({
		status: "attention",
		accessLevel: "base",
		primaryAction: "refresh",
		paidExpiresAt: null,
		baseExpiresAt: "2027-01-01T00:00:00Z",
		currentOfferId: null,
		managementUrl: null,
		pendingCheckout: null,
		offers: [offer],
	});
	await page.reload();
	await expect(page.getByRole("heading", { name: "Payment needs review" })).toBeVisible();
	await expect(page.getByText(/Do not pay again/)).toBeVisible();
	await expect(page.getByText("Monthly sponsor access", { exact: true })).toHaveCount(0);
	await assertNoHorizontalOverflow(page);
});

test("failed sponsor refresh keeps stale access visible and reveals an action error", async ({
	page,
	mockApi,
}) => {
	const offer = sponsorSubscriptionOffer();
	const provisioningState = {
		status: "provisioning",
		accessLevel: "base",
		primaryAction: "refresh",
		paidExpiresAt: null,
		baseExpiresAt: "2027-01-01T00:00:00Z",
		currentOfferId: null,
		managementUrl: null,
		pendingCheckout: null,
		offers: [offer],
	};
	mockApi.mock("GET", "/api/me/sponsor", [
		{ body: provisioningState },
		{ status: 503, body: { detail: "Unavailable" } },
		{ status: 503, body: { detail: "Unavailable" } },
	]);

	await page.goto("/");
	await expect(page.getByRole("heading", { name: "Payment received" })).toBeVisible();
	await page.getByRole("button", { name: "Refresh status" }).click();
	const error = page.getByRole("alert").filter({
		hasText: "Could not refresh extended access status. Your existing access is unchanged",
	});
	await expectActionErrorRevealed(error);
	await expect(page.getByRole("heading", { name: "Payment received" })).toBeVisible();
	await expect(
		page.getByRole("heading", { name: "Extended access status unavailable" }),
	).toHaveCount(0);
	await assertNoHorizontalOverflow(page);
});

test("pending checkout checks quietly and switches directly to another offer", async ({
	page,
	mockApi,
}) => {
	const offer = sponsorSubscriptionOffer();
	const donationOffer = sponsorDonationOffer();
	const pendingState = {
		status: "checkout_pending",
		accessLevel: "base",
		primaryAction: "continue_checkout",
		paidExpiresAt: null,
		baseExpiresAt: "2027-01-01T00:00:00Z",
		currentOfferId: null,
		managementUrl: null,
		pendingCheckout: {
			id: "40000000-0000-4000-8000-000000000001",
			offerId: offer.id,
			status: "pending",
			checkoutUrl: offer.checkoutUrl,
			expiresAt: "2026-08-14T12:30:00Z",
		},
		offers: [offer, donationOffer],
	};
	mockApi.seedSponsorState(pendingState);
	mockApi.seedSponsorOffers([offer, donationOffer]);

	await page.goto("/");
	await expect(page.getByRole("heading", { name: "Payment not confirmed yet" })).toBeVisible();
	mockApi.mock("GET", "/api/me/sponsor", [
		{ delayMs: 350, body: pendingState },
		{ body: pendingState },
	]);

	const checkStatus = page.getByRole("button", { name: "Check payment status" });
	await checkStatus.click();
	await expect(checkStatus).toHaveAttribute("aria-busy", "true");
	await expect(checkStatus).toBeDisabled();
	await expect(page.getByRole("status")).toHaveCount(0);

	const donationCard = page.getByRole("article", { name: "One month sponsor" });
	const requestPromise = page.waitForRequest(
		(request) =>
			request.method() === "POST" &&
			new URL(request.url()).pathname === "/api/me/sponsor/checkouts",
	);
	await donationCard.getByRole("button", { name: "Support in Tribute" }).click();
	await requestPromise;
	expect(mockApi.calls).toContain("POST /api/me/sponsor/checkouts");
});

test("pending checkout can stop local waiting without losing the available offers", async ({
	page,
	mockApi,
}) => {
	const offer = sponsorSubscriptionOffer();
	const donationOffer = sponsorDonationOffer();
	const checkoutId = "40000000-0000-4000-8000-000000000001";
	mockApi.seedSponsorState({
		status: "checkout_pending",
		accessLevel: "base",
		primaryAction: "continue_checkout",
		paidExpiresAt: null,
		baseExpiresAt: "2027-01-01T00:00:00Z",
		currentOfferId: null,
		managementUrl: null,
		pendingCheckout: {
			id: checkoutId,
			offerId: offer.id,
			status: "pending",
			checkoutUrl: offer.checkoutUrl,
			expiresAt: "2026-08-14T12:30:00Z",
		},
		offers: [offer, donationOffer],
	});

	await page.goto("/");
	const deleteRequest = page.waitForRequest(
		(request) =>
			request.method() === "DELETE" &&
			new URL(request.url()).pathname.endsWith(`/checkouts/${checkoutId}`),
	);
	await page.getByRole("button", { name: "Cancel this attempt" }).click();
	await deleteRequest;
	await expect(page.getByRole("heading", { name: "Payment not confirmed yet" })).toHaveCount(0);
	await expect(page.getByRole("status")).toHaveCount(0);
	await expect(page.getByRole("article", { name: "Monthly sponsor access" })).toBeVisible();
	await expect(page.getByRole("article", { name: "One month sponsor" })).toBeVisible();
	await assertNoHorizontalOverflow(page);
});

test("failed pending cancellation keeps all recovery actions available", async ({
	page,
	mockApi,
}) => {
	const offer = sponsorSubscriptionOffer();
	const donationOffer = sponsorDonationOffer();
	mockApi.seedSponsorState({
		status: "checkout_pending",
		accessLevel: "base",
		primaryAction: "continue_checkout",
		paidExpiresAt: null,
		baseExpiresAt: "2027-01-01T00:00:00Z",
		currentOfferId: null,
		managementUrl: null,
		pendingCheckout: {
			id: "40000000-0000-4000-8000-000000000001",
			offerId: offer.id,
			status: "pending",
			checkoutUrl: offer.checkoutUrl,
			expiresAt: "2026-08-14T12:30:00Z",
		},
		offers: [offer, donationOffer],
	});
	mockApi.mock("DELETE", /^\/api\/(?:me\/sponsor|debug\/sponsor\/\d+)\/checkouts\/[^/]+$/, {
		status: 503,
		body: { detail: "Unavailable" },
	});

	await page.goto("/");
	await page.getByRole("button", { name: "Cancel this attempt" }).click();
	await expect(page.getByRole("alert")).toContainText(
		"Could not close this payment attempt. It is still waiting for confirmation",
	);
	await expect(page.getByRole("button", { name: "Check payment status" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Continue in Tribute" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Cancel this attempt" })).toBeVisible();
});

test("failed alternative checkout keeps the existing pending intent visible", async ({
	page,
	mockApi,
}) => {
	const offer = sponsorSubscriptionOffer();
	const donationOffer = sponsorDonationOffer();
	mockApi.seedSponsorState({
		status: "checkout_pending",
		accessLevel: "base",
		primaryAction: "continue_checkout",
		paidExpiresAt: null,
		baseExpiresAt: "2027-01-01T00:00:00Z",
		currentOfferId: null,
		managementUrl: null,
		pendingCheckout: {
			id: "40000000-0000-4000-8000-000000000001",
			offerId: offer.id,
			status: "pending",
			checkoutUrl: offer.checkoutUrl,
			expiresAt: "2026-08-14T12:30:00Z",
		},
		offers: [offer, donationOffer],
	});
	mockApi.mock("POST", "/api/me/sponsor/checkouts", {
		status: 503,
		body: { detail: "Unavailable" },
	});

	await page.goto("/");
	await page
		.getByRole("article", { name: "One month sponsor" })
		.getByRole("button", { name: "Support in Tribute" })
		.click();
	await expect(page.getByRole("heading", { name: "Payment not confirmed yet" })).toBeVisible();
	await expect(page.getByRole("alert")).toContainText(
		"Could not start this payment. No payment was created",
	);
	await expect(page.getByRole("button", { name: "Continue in Tribute" })).toHaveCount(1);
});

test("returning to a completed donation refreshes access and removes pending guidance", async ({
	page,
	mockApi,
}) => {
	const subscriptionOffer = sponsorSubscriptionOffer();
	const donationOffer = sponsorDonationOffer();
	mockApi.seedSponsorState({
		status: "checkout_pending",
		accessLevel: "base",
		primaryAction: "continue_checkout",
		paidExpiresAt: null,
		baseExpiresAt: "2027-01-01T00:00:00Z",
		currentOfferId: null,
		managementUrl: null,
		pendingCheckout: {
			id: "40000000-0000-4000-8000-000000000001",
			offerId: donationOffer.id,
			status: "pending",
			checkoutUrl: donationOffer.checkoutUrl,
			expiresAt: "2026-08-14T12:30:00Z",
		},
		offers: [donationOffer, subscriptionOffer],
	});

	await page.goto("/");
	const pendingCard = page.getByRole("region", { name: "Payment not confirmed yet" });
	const pendingHeartColor = await pendingCard
		.locator('[data-status="checkout_pending"]')
		.evaluate((element) => getComputedStyle(element).color);
	const inviteColor = await page
		.getByText(/^Registered through your invite:/)
		.locator("..")
		.evaluate((element) => getComputedStyle(element).color);
	expect(inviteColor).toBe(pendingHeartColor);

	mockApi.seedSponsorState({
		status: "one_time_active",
		accessLevel: "paid",
		primaryAction: "renew",
		paidExpiresAt: "2026-09-13T15:39:49Z",
		baseExpiresAt: "2027-01-01T00:00:00Z",
		currentOfferId: donationOffer.id,
		managementUrl: null,
		pendingCheckout: null,
		offers: [donationOffer, subscriptionOffer],
	});
	mockApi.mock("GET", "/api/me/subscription", {
		body: { ...mockData.subscription, expiresAt: 1_789_315_189 },
	});

	await page.evaluate(() => window.dispatchEvent(new Event("focus")));
	const activeCard = page.getByRole("region", { name: "Extended access is active" });
	await expect(activeCard).toBeVisible();
	await expect(page.getByRole("button", { name: "Continue in Tribute" })).toHaveCount(0);
	await expect(page.getByRole("button", { name: "Check payment status" })).toHaveCount(0);
	await expect(page.getByRole("button", { name: "Extend access" })).toBeVisible();
	const activeHeartColor = await activeCard
		.locator('[data-status="one_time_active"]')
		.evaluate((element) => getComputedStyle(element).color);
	expect(activeHeartColor).not.toBe(pendingHeartColor);
	expect(
		mockApi.calls.filter((call) => call === "GET /api/me/subscription").length,
	).toBeGreaterThanOrEqual(2);

	await page.getByRole("button", { name: "Extend access" }).click();
	await expect(page.getByText("One month sponsor", { exact: true })).toBeVisible();
	await expect(page.getByText("Monthly sponsor access", { exact: true })).toBeVisible();
	await expect(activeCard.getByText("Donation", { exact: true })).toHaveCount(0);
	await expect(activeCard.getByText("Subscription", { exact: true })).toHaveCount(0);
	await assertNoHorizontalOverflow(page);
});

test("sponsor checkout card produces reviewable light and dark evidence", async ({
	page,
	mockApi,
}, testInfo) => {
	const offer = sponsorMultiPeriodOffer();
	const donationOffer = sponsorDonationOffer();
	const accessibilityByTheme: Array<{ theme: "light" | "dark"; serious: unknown[] }> = [];

	for (const colorScheme of ["light", "dark"] as const) {
		mockApi.seedSponsorState({
			status: "base_access",
			accessLevel: "base",
			primaryAction: "choose_offer",
			paidExpiresAt: null,
			baseExpiresAt: "2099-12-31T23:59:59Z",
			currentOfferId: null,
			managementUrl: null,
			pendingCheckout: null,
			offers: [offer],
		});
		await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
		await page.goto("/");
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		const card = page.getByRole("region", { name: "Upgrade your access" });
		await expect(card).toBeVisible();
		await expect(card.getByText("Basic access", { exact: true })).toBeVisible();
		await expect(card.getByText("No expiry", { exact: true })).toBeVisible();
		const neutralBorder = colorScheme === "light" ? "rgb(199, 199, 199)" : "rgb(66, 66, 66)";
		const accessFact = card.locator('[data-ui="sponsor-access-fact"]');
		await expect(accessFact).toHaveCSS(
			"background-color",
			colorScheme === "light" ? "rgb(242, 242, 242)" : "rgb(41, 41, 41)",
		);
		await expect(accessFact).toHaveCSS("border-color", neutralBorder);
		await expect(accessFact).toHaveCSS("border-style", "solid");
		const availableOffer = card.getByRole("article", { name: "Sponsor access" });
		const accentBorder = colorScheme === "light" ? "rgb(198, 237, 217)" : "rgb(37, 96, 66)";
		const accentInset = colorScheme === "light" ? "rgb(36, 120, 79)" : "rgb(73, 221, 147)";
		await expect(availableOffer).toHaveCSS("border-color", accentBorder);
		await expect(availableOffer).toHaveCSS("box-shadow", `${accentInset} 3px 0px 0px 0px inset`);
		const paymentOptions = card.getByRole("list", { name: "Payment options from Tribute" });
		await expect(availableOffer.locator('[data-ui="welcome-discount"]')).toHaveCount(0);
		await expect(paymentOptions.locator("del")).toHaveCount(0);
		await expect(paymentOptions).toHaveCSS(
			"background-color",
			colorScheme === "light" ? "rgb(242, 242, 242)" : "rgb(41, 41, 41)",
		);
		await expect(paymentOptions).toHaveCSS("border-color", neutralBorder);
		await expect(paymentOptions.getByRole("listitem").nth(1)).toHaveCSS(
			"border-top-color",
			colorScheme === "light" ? "rgb(230, 230, 230)" : "rgb(37, 37, 37)",
		);
		await expect(paymentOptions.getByText("Billed monthly", { exact: true })).toBeVisible();
		await expect(paymentOptions.getByText("Billed every 3 months", { exact: true })).toBeVisible();
		await expect(paymentOptions.getByText("Billed yearly", { exact: true })).toBeVisible();
		const benefits = availableOffer.getByLabel("Included access");
		await expect(benefits.getByText("100 GB", { exact: true })).toBeVisible();
		await expect(benefits.getByText("5", { exact: true })).toBeVisible();
		await expect(
			card.getByText(
				"Prices and billing intervals come from Tribute. Choose the payment option there",
			),
		).toBeVisible();
		await availableOffer.scrollIntoViewIfNeeded();
		await availableOffer.screenshot({
			path: testInfo.outputPath(`sponsor-card-${colorScheme}.png`),
		});
		await card.screenshot({
			path: testInfo.outputPath(`sponsor-access-hierarchy-${colorScheme}.png`),
		});
		const result = await new AxeBuilder({ page }).analyze();
		const serious = result.violations.filter((violation) =>
			["serious", "critical"].includes(violation.impact ?? ""),
		);
		accessibilityByTheme.push({ theme: colorScheme, serious });
		await assertNoHorizontalOverflow(page);

		mockApi.seedSponsorState({
			status: "checkout_pending",
			accessLevel: "base",
			primaryAction: "continue_checkout",
			paidExpiresAt: null,
			baseExpiresAt: "2099-12-31T23:59:59Z",
			currentOfferId: null,
			managementUrl: null,
			pendingCheckout: {
				id: "40000000-0000-4000-8000-000000000001",
				offerId: offer.id,
				status: "pending",
				checkoutUrl: offer.checkoutUrl,
				expiresAt: "2026-08-14T12:30:00Z",
			},
			offers: [offer, donationOffer],
		});
		await page.reload();
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		const pendingCard = page.getByRole("region", { name: "Payment not confirmed yet" });
		await expect(pendingCard).toBeVisible();
		await expect(pendingCard.getByRole("article", { name: "Sponsor access" })).toHaveCount(0);
		await expect(
			pendingCard
				.getByRole("article", { name: "One month sponsor" })
				.getByRole("button", { name: "Support in Tribute" }),
		).toBeVisible();
		await pendingCard.screenshot({
			path: testInfo.outputPath(`sponsor-pending-${colorScheme}.png`),
		});
		await expect(page.getByRole("dialog")).toHaveCount(0);
		await assertNoHorizontalOverflow(page);

		mockApi.seedSponsorState({
			status: "one_time_active",
			accessLevel: "paid",
			primaryAction: "renew",
			paidExpiresAt: "2026-09-14T10:00:00Z",
			baseExpiresAt: "2027-01-01T00:00:00Z",
			currentOfferId: offer.id,
			managementUrl: null,
			pendingCheckout: null,
			offers: [offer],
		});
		await page.reload();
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		await expect(page.getByRole("region", { name: "Extended access is active" })).toBeVisible();
		await page.screenshot({
			path: testInfo.outputPath(`home-sponsor-active-${colorScheme}.png`),
			fullPage: true,
		});
		await expect(page.getByRole("button", { name: "Extend access" })).toBeVisible();
		await expect(page.getByText(/^Registered through your invite:/).locator("..")).toBeVisible();
		await assertNoHorizontalOverflow(page);

		const recurringDonationOffer = sponsorDonationOffer(
			undefined,
			undefined,
			"recurring",
			"monthly",
		);
		mockApi.seedSponsorState({
			status: "recurring_donation_active",
			accessLevel: "paid",
			primaryAction: "manage_auto_donation",
			paidExpiresAt: "2026-09-14T10:00:00Z",
			baseExpiresAt: "2027-01-01T00:00:00Z",
			currentOfferId: recurringDonationOffer.id,
			managementUrl: "https://t.me/tribute",
			pendingCheckout: null,
			offers: [recurringDonationOffer],
		});
		await page.reload();
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		const recurringCard = page.getByRole("region", { name: "Extended access is active" });
		await expect(recurringCard).toBeVisible();
		await recurringCard.screenshot({
			path: testInfo.outputPath(`sponsor-recurring-donation-${colorScheme}.png`),
		});
		await expect(
			page.getByRole("button", { name: "Manage auto-donation in Tribute" }),
		).toBeVisible();
		await expect(page.getByRole("button", { name: "Extend access" })).toHaveCount(0);
		await assertNoHorizontalOverflow(page);
	}
	expect(accessibilityByTheme.filter(({ serious }) => serious.length > 0)).toEqual([]);
});

test("identified donation checkout clearly warns against anonymous attribution", async ({
	page,
	mockApi,
}, testInfo) => {
	const offer = sponsorDonationOffer(
		"https://t.me/tribute/app?startapp=donation",
		"Flexible sponsor donation",
	);
	const recurringOffer = {
		...sponsorDonationOffer(
			"https://t.me/tribute/app?startapp=donation-yearly",
			"Yearly sponsor donation",
			"recurring",
			"yearly",
		),
		id: "30000000-0000-4000-8000-000000000003",
		expectedAmountMinor: 350_000,
		priceOptions: [{ priceMajor: "3500", currency: "RUB", period: "yearly" }],
	};
	mockApi.seedSponsorState({
		status: "no_access",
		accessLevel: "none",
		primaryAction: "choose_offer",
		paidExpiresAt: null,
		baseExpiresAt: null,
		currentOfferId: null,
		managementUrl: null,
		pendingCheckout: null,
		offers: [offer, recurringOffer],
	});
	mockApi.mock("GET", "/api/me/subscription", {
		status: 404,
		body: { detail: "No subscription" },
	});

	for (const colorScheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
		await page.goto("/");
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		const card = page.getByRole("region", { name: "Get extended access" });
		await expect(card.getByText("Flexible sponsor donation", { exact: true })).toBeVisible();
		const donationPriceRows = card.locator('[data-ui="sponsor-donation-price"]');
		await expect(donationPriceRows).toHaveCount(2);
		for (const priceRow of await donationPriceRows.all()) {
			await expect(priceRow).toHaveCSS(
				"background-color",
				colorScheme === "light" ? "rgb(242, 242, 242)" : "rgb(41, 41, 41)",
			);
			await expect(priceRow).toHaveCSS(
				"border-color",
				colorScheme === "light" ? "rgb(199, 199, 199)" : "rgb(66, 66, 66)",
			);
		}
		await expect(
			card.getByText(/RUB.*500.*One-time donation.*same Telegram account/i),
		).toBeVisible();
		await expect(
			card.getByText(/RUB.*3,500.*Auto-donation every year.*same Telegram account/i),
		).toBeVisible();
		await expect(card.getByText(/Other settings need manual review/)).toHaveCount(2);
		await card.screenshot({
			path: testInfo.outputPath(`sponsor-donation-choices-${colorScheme}.png`),
		});
		await assertNoHorizontalOverflow(page);
	}
});

test("sponsor offer editor stays native to the design system in both themes", async ({
	page,
	mockApi,
}, testInfo) => {
	mockApi.seedCommerceRules([sponsorDonationRule()]);

	for (const colorScheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
		await page.goto("/admin/settings/tribute/sponsor-offers");
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		await page.getByRole("button", { name: "Create first offer" }).click();
		const dialog = page.getByRole("dialog", { name: "Create sponsor offer" });
		await expect(dialog).toBeVisible();
		await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toHaveCount(0);
		await dialog.getByRole("radio", { name: "Auto-donation" }).click();
		await expect(dialog.getByLabel("Auto-donation frequency")).toBeVisible();
		await dialog.screenshot({
			path: testInfo.outputPath(`sponsor-offer-editor-${colorScheme}.png`),
		});
		const result = await new AxeBuilder({ page }).analyze();
		const serious = result.violations.filter((violation) =>
			["serious", "critical"].includes(violation.impact ?? ""),
		);
		expect(serious).toEqual([]);
		await assertNoHorizontalOverflow(page);
		await page.getByRole("button", { name: "Close offer editor" }).click();
	}
});
