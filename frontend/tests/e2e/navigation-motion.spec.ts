import type { Locator } from "@playwright/test";
import { expect, test } from "./fixtures/mock-api.ts";

async function selectedLayerOpacity(locator: Locator): Promise<number> {
	return locator.evaluate((element) => Number(getComputedStyle(element, "::before").opacity));
}

async function selectedLayerDurationMs(locator: Locator): Promise<number> {
	return locator.evaluate((element) => {
		const firstDuration = getComputedStyle(element, "::before").transitionDuration.split(",")[0];
		return Number.parseFloat(firstDuration) * 1000;
	});
}

test("distant navigation selections cross-fade locally instead of travelling", async ({
	page,
	mockApi: _mock,
}) => {
	await page.emulateMedia({ reducedMotion: "no-preference" });
	await page.goto("/");
	const navigation = page.getByRole("navigation");
	const home = navigation.getByRole("link", { name: "Home" });
	const support = navigation.getByRole("link", { name: "Support" });

	expect(await selectedLayerDurationMs(home)).toBeLessThanOrEqual(200);
	await expect.poll(() => selectedLayerOpacity(home)).toBe(1);
	await support.click();
	await expect(page).toHaveURL(/\/support$/);
	await expect.poll(() => selectedLayerOpacity(home)).toBe(0);
	await expect.poll(() => selectedLayerOpacity(support)).toBe(1);

	await page.goto("/admin/dashboard");
	const dashboardView = page.getByRole("group", { name: "Dashboard view" });
	const vpn = dashboardView.getByRole("button", { name: "VPN" });
	const bot = dashboardView.getByRole("button", { name: "Bot" });
	await expect.poll(() => selectedLayerOpacity(vpn)).toBe(1);
	await bot.click();
	await expect.poll(() => selectedLayerOpacity(vpn)).toBe(0);
	await expect.poll(() => selectedLayerOpacity(bot)).toBe(1);
});

test("selection motion follows the system Reduce Motion preference", async ({
	page,
	mockApi: _mock,
}) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto("/admin/dashboard");
	const vpn = page
		.getByRole("group", { name: "Dashboard view" })
		.getByRole("button", { name: "VPN" });
	expect(await selectedLayerDurationMs(vpn)).toBeLessThan(1);
});

test("form controls avoid the iOS focus-zoom threshold without disabling user zoom", async ({
	page,
	mockApi: _mock,
}) => {
	await page.goto("/admin/settings/beszel");
	const urlInput = page.getByPlaceholder("https://monitor.example.com");
	const fontSize = await urlInput.evaluate((element) =>
		Number.parseFloat(getComputedStyle(element).fontSize),
	);
	expect(fontSize).toBeGreaterThanOrEqual(16);
	const viewport = await page.locator('meta[name="viewport"]').getAttribute("content");
	expect(viewport).not.toContain("user-scalable=no");
	expect(viewport).not.toContain("maximum-scale=1");
});
