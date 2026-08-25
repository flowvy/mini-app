import AxeBuilder from "@axe-core/playwright";
import { assertNoHorizontalOverflow, expect, mockData, test } from "./fixtures/mock-api.ts";

test("Home shows Telegram username instead of the technical provider identity", async ({
	page,
	mockApi,
}, testInfo) => {
	mockApi.mock("GET", "/api/me/subscription", {
		body: {
			...mockData.subscription,
			name: "tg_123456789",
			telegramUsername: "alice",
		},
	});

	await page.goto("/");

	for (const colorScheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		await expect(page.getByText("@alice", { exact: true })).toBeVisible();
		await expect(page.getByText("tg_123456789", { exact: true })).toHaveCount(0);
		await assertNoHorizontalOverflow(page);
		expect((await new AxeBuilder({ page }).include("main").analyze()).violations).toEqual([]);
		await page.screenshot({
			path: testInfo.outputPath(`home-telegram-identity-${colorScheme}.png`),
			fullPage: true,
		});
	}
});

test("Home keeps the provider identity when Telegram username is absent", async ({
	page,
	mockApi,
}) => {
	mockApi.mock("GET", "/api/me/subscription", {
		body: {
			...mockData.subscription,
			name: "tg_123456789",
			telegramUsername: null,
		},
	});

	await page.goto("/");

	await expect(page.getByText("tg_123456789", { exact: true })).toBeVisible();
});
