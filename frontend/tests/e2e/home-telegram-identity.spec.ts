import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { assertNoHorizontalOverflow, expect, mockData, test } from "./fixtures/mock-api.ts";

async function applyTheme(page: Page, theme: "light" | "dark"): Promise<void> {
	await page.evaluate((value) => {
		document.documentElement.setAttribute("data-theme", value);
	}, theme);
	await expect(page.getByRole("main")).toHaveCSS(
		"color",
		theme === "dark" ? "rgb(255, 255, 255)" : "rgb(23, 23, 23)",
	);
}

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
		await applyTheme(page, colorScheme);
		await expect(page.getByText("10.0 GB", { exact: true })).toHaveCSS(
			"color",
			colorScheme === "dark" ? "rgb(255, 255, 255)" : "rgb(23, 23, 23)",
		);
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
