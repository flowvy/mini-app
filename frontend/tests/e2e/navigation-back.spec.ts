import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/mock-api.ts";

const launchParams = new URLSearchParams({
	tgWebAppPlatform: "ios",
	tgWebAppVersion: "9.6",
	tgWebAppThemeParams: JSON.stringify({
		bg_color: "#ffffff",
		button_color: "#31d58b",
		button_text_color: "#111111",
	}),
});

async function emitTelegramBack(page: Page): Promise<void> {
	await page.evaluate(() => {
		const telegramWindow = window as typeof window & {
			Telegram?: { WebView?: { receiveEvent?: (event: string) => void } };
		};
		telegramWindow.Telegram?.WebView?.receiveEvent?.("back_button_pressed");
	});
}

async function latestTelegramBackButton(page: Page): Promise<{ is_visible: boolean } | null> {
	return page.evaluate(() => {
		const telegramWindow = window as typeof window & {
			__telegramEvents?: Array<{ eventType: string; eventData?: string }>;
		};
		const eventData = telegramWindow.__telegramEvents
			?.filter((event) => event.eventType === "web_app_setup_back_button")
			.at(-1)?.eventData;
		return eventData ? JSON.parse(eventData) : null;
	});
}

test.beforeEach(async ({ page }) => {
	await page.addInitScript(() => {
		const telegramWindow = window as typeof window & {
			__telegramEvents?: Array<{ eventType: string; eventData?: string }>;
		};
		telegramWindow.__telegramEvents = [];
		Object.defineProperty(window, "TelegramWebviewProxy", {
			configurable: true,
			value: {
				postEvent: (eventType: string, eventData?: string) => {
					telegramWindow.__telegramEvents?.push({ eventType, eventData });
				},
			},
		});
	});
});

test("native Back keeps Beszel discard navigation scoped to Settings", async ({
	page,
	mockApi: _mock,
}) => {
	await page.goto(`/admin/dashboard?${launchParams.toString()}`);
	await page.getByRole("link", { name: "Settings" }).click();
	await page.getByRole("button", { name: /^Beszel Hub and read-only access/ }).click();
	await expect(page).toHaveURL(/\/admin\/settings\/beszel$/);

	await page.getByLabel("Hub URL").fill("https://changed.example.test");
	await emitTelegramBack(page);

	const discardDialog = page.getByRole("dialog", { name: "Discard changes?" });
	await expect(discardDialog).toBeVisible();
	await discardDialog.evaluate((dialog) => dialog.click());
	await expect(discardDialog).toHaveCount(0);
	await expect(page).toHaveURL(/\/admin\/settings\/beszel$/);

	await emitTelegramBack(page);
	await expect(discardDialog).toBeVisible();
	await discardDialog.getByRole("button", { name: "Discard", exact: true }).click();

	await expect(page).toHaveURL(/\/admin\/settings$/);
	await expect(page).not.toHaveURL(/\/admin\/dashboard$/);
});

test("native Back dismisses the topmost confirmation before its owning route", async ({
	page,
	mockApi: _mock,
}) => {
	await page.goto(`/admin/users/1?${launchParams.toString()}`);
	await page.getByRole("button", { name: "Disable", exact: true }).click();

	const confirmation = page.getByRole("dialog", { name: "Disable user?" });
	await expect(confirmation).toBeVisible();
	await emitTelegramBack(page);

	await expect(confirmation).toHaveCount(0);
	await expect(page).toHaveURL(/\/admin\/users\/1(?:\?.*)?$/);
});

test("a confirmation temporarily owns native Back on a primary tab", async ({
	page,
	mockApi: _mock,
}) => {
	await page.goto(`/devices?${launchParams.toString()}`);

	await page.getByRole("button", { name: "Delete device" }).click();
	const confirmation = page.getByRole("alertdialog", { name: "Remove device?" });
	await expect(confirmation).toBeVisible();
	await expect.poll(() => latestTelegramBackButton(page)).toEqual({ is_visible: true });

	await emitTelegramBack(page);
	await expect(confirmation).toHaveCount(0);
	await expect(page).toHaveURL(/\/devices(?:\?.*)?$/);
	await expect.poll(() => latestTelegramBackButton(page)).toEqual({ is_visible: false });
	await emitTelegramBack(page);
	await expect(page).toHaveURL(/\/devices(?:\?.*)?$/);
});

test("native Back closes an editor before leaving its settings route", async ({
	page,
	mockApi,
}) => {
	mockApi.seedCommerceRules([
		{
			id: "10000000-0000-4000-8000-000000000001",
			provider: "tribute",
			name: "Monthly donation access",
			commerceType: "donation",
			paymentMode: "any",
			externalItemId: null,
			currency: "RUB",
			calculationType: "fixed",
			fixedDurationDays: 30,
			amountBands: [],
			accessProfileId: "00000000-0000-4000-8000-000000000001",
			grantMode: "extend",
			priority: 100,
			isEnabled: true,
		},
	]);
	await page.goto(`/admin/settings/tribute?${launchParams.toString()}`);
	await page.getByRole("button", { name: /Monthly donation access/ }).click();

	const editor = page.getByRole("dialog", { name: "Edit automation rule" });
	await expect(editor).toBeVisible();
	await emitTelegramBack(page);

	await expect(editor).toHaveCount(0);
	await expect(page).toHaveURL(/\/admin\/settings\/tribute(?:\?.*)?$/);
});

test("browser history keeps the visible tab mode aligned with the route", async ({
	page,
	mockApi: _mock,
}) => {
	await page.goto(`/?${launchParams.toString()}`);
	await page.getByRole("button", { name: "Admin mode" }).click();
	await expect(page).toHaveURL(/\/admin\/dashboard$/);
	await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();

	await page.getByRole("button", { name: "User mode" }).click();
	await expect(page).toHaveURL(/\/$/);
	await expect(page.getByRole("link", { name: "Home" })).toBeVisible();

	await page.goBack();
	await expect(page).toHaveURL(/\/admin\/dashboard$/);
	await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
});
