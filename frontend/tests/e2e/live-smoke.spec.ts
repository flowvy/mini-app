import { expect, test } from "@playwright/test";

test("read-only live routes render against the local BFF and configured Remnawave", async ({
	page,
}) => {
	const pageErrors: string[] = [];
	const failedApiResponses: string[] = [];
	const requestFailures: string[] = [];

	page.on("pageerror", (error) => pageErrors.push(error.message));
	page.on("requestfailed", (request) => {
		if (new URL(request.url()).pathname.startsWith("/api/")) {
			requestFailures.push(`${request.method()} ${new URL(request.url()).pathname}`);
		}
	});
	page.on("response", (response) => {
		const url = new URL(response.url());
		if (url.pathname.startsWith("/api/") && response.status() >= 500) {
			failedApiResponses.push(`${response.status()} ${url.pathname}`);
		}
	});

	// Telegram's hosted SDK is not part of this integration probe. Keep the UI
	// deterministic while every Flowvy API call still reaches the live local BFF.
	await page.route("https://telegram.org/js/telegram-web-app.js", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/javascript",
			body: "window.Telegram = window.Telegram || {}; window.Telegram.WebApp = window.Telegram.WebApp || {};",
		});
	});

	await page.goto("/");
	await expect(page.getByText("Account Info")).toBeVisible();
	await expect(page.getByText("Active", { exact: true })).toBeVisible();

	await page.goto("/devices");
	await expect(page.getByRole("button", { name: "Delete device" }).first()).toBeVisible();
	await expect(page.getByRole("button", { name: "Remove all devices" })).toBeVisible();

	await page.goto("/admin/dashboard");
	await expect(page.getByRole("button", { name: "Remnawave" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Flowvy Mini-App" })).toBeVisible();

	await page.goto("/admin/users");
	await expect(page.getByRole("textbox", { name: "Search users" })).toBeVisible();
	await expect(page.getByRole("button", { name: /^All / })).toBeVisible();
	await page.getByRole("list").getByRole("button").first().click();
	await expect(page).toHaveURL(/\/admin\/users\/\d+$/);
	await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

	await page.goto("/admin/settings");
	await expect(page.getByText("Integrations")).toBeVisible();
	await expect(page.getByText("v2.8.1", { exact: true })).toBeVisible();

	expect(pageErrors).toEqual([]);
	expect(requestFailures).toEqual([]);
	expect(failedApiResponses).toEqual([]);
});
