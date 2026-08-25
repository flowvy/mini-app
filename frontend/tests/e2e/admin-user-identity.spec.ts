import AxeBuilder from "@axe-core/playwright";
import { assertNoHorizontalOverflow, expect, mockData, test } from "./fixtures/mock-api.ts";

test("Telegram username is primary and provider username remains visible", async ({
	page,
	mockApi: _mock,
}, testInfo) => {
	for (const colorScheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
		await page.goto("/admin/users");
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);

		await expect(page.getByText("@alice", { exact: true })).toBeVisible();
		await expect(page.getByText("tg_123456789", { exact: false })).toBeVisible();
		const search = page.getByRole("button", { name: "Search users" });
		await search.click();
		const input = page.getByRole("textbox", { name: "Search users" });
		await input.fill("alice");
		await expect(page.getByText("@alice", { exact: true })).toBeVisible();
		await input.fill("tg_123456789");
		await expect(page.getByText("@alice", { exact: true })).toBeVisible();
		await assertNoHorizontalOverflow(page);
		expect((await new AxeBuilder({ page }).include("main").analyze()).violations).toEqual([]);
		await page.screenshot({
			path: testInfo.outputPath(`admin-user-search-identity-${colorScheme}.png`),
			animations: "disabled",
		});

		await page.goto("/admin/users/1");
		await expect(page.getByText("@alice", { exact: true })).toBeVisible();
		await expect(page.getByText("tg_123456789", { exact: true })).toBeVisible();
		await assertNoHorizontalOverflow(page);
		expect((await new AxeBuilder({ page }).include("main").analyze()).violations).toEqual([]);
		await page.screenshot({
			path: testInfo.outputPath(`admin-user-detail-identity-${colorScheme}.png`),
			animations: "disabled",
		});
	}
});

test("provider username remains the fallback without a Telegram username", async ({
	page,
	mockApi,
}) => {
	const providerOnly = { ...mockData.adminUser, telegramUsername: null };
	mockApi.mock("GET", "/api/debug/admin/users/all", {
		body: { users: [providerOnly], total: 1 },
	});
	mockApi.mock("GET", "/api/debug/admin/users/1", { body: providerOnly });

	await page.goto("/admin/users");
	await expect(page.getByText("tg_123456789", { exact: true })).toBeVisible();
	await expect(page.getByText("@alice", { exact: true })).toHaveCount(0);

	await page.goto("/admin/users/1");
	await expect(page.getByText("tg_123456789", { exact: true })).toBeVisible();
	await expect(page.getByText("@alice", { exact: true })).toHaveCount(0);
});
