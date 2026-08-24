import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/mock-api.ts";
import { closeTelegramPopup, telegramPopups } from "./fixtures/telegram-main-button.ts";

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
	await page.getByRole("button", { name: /^Pulse monitoring/ }).click();
	await page.getByRole("button", { name: /^Beszel Hub and read-only access/ }).click();
	await expect(page).toHaveURL(/\/admin\/settings\/beszel$/);

	await page.getByLabel("Hub URL").fill("https://changed.example.test");
	await emitTelegramBack(page);

	const discardDialog = page.getByRole("dialog", { name: "Discard changes?" });
	await expect(discardDialog).toHaveCount(0);
	await expect.poll(async () => (await telegramPopups(page)).length).toBe(1);
	await closeTelegramPopup(page, "cancel");
	await expect(page).toHaveURL(/\/admin\/settings\/beszel$/);

	await emitTelegramBack(page);
	await expect.poll(async () => (await telegramPopups(page)).length).toBe(2);
	await closeTelegramPopup(page, "confirm");

	await expect(page).toHaveURL(/\/admin\/settings\/pulse$/);
	await expect(page).not.toHaveURL(/\/admin\/dashboard$/);
});

test("native popup dismissal keeps its owning route", async ({ page, mockApi: _mock }) => {
	await page.goto(`/admin/users/1?${launchParams.toString()}`);
	await page.getByRole("button", { name: "Disable", exact: true }).click();

	const confirmation = page.getByRole("dialog", { name: "Disable user?" });
	await expect(confirmation).toHaveCount(0);
	await expect.poll(async () => (await telegramPopups(page)).length).toBe(1);
	await closeTelegramPopup(page, null);
	await expect(page).toHaveURL(/\/admin\/users\/1(?:\?.*)?$/);
});

test("a native confirmation leaves primary-tab Back ownership with Telegram", async ({
	page,
	mockApi: _mock,
}) => {
	await page.goto(`/devices?${launchParams.toString()}`);

	await page.getByRole("button", { name: "Delete device" }).click();
	const confirmation = page.getByRole("alertdialog", { name: "Remove device?" });
	await expect(confirmation).toHaveCount(0);
	await expect.poll(async () => (await telegramPopups(page)).length).toBe(1);
	await expect.poll(() => latestTelegramBackButton(page)).not.toEqual({ is_visible: true });
	await closeTelegramPopup(page, "cancel");
	await expect(page).toHaveURL(/\/devices(?:\?.*)?$/);
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
	await page.goto(`/admin/settings/tribute/automation-rules?${launchParams.toString()}`);
	await page.getByRole("button", { name: /Monthly donation access/ }).click();

	const editor = page.getByRole("dialog", { name: "Edit automation rule" });
	await expect(editor).toBeVisible();
	await emitTelegramBack(page);

	await expect(editor).toHaveCount(0);
	await expect(page).toHaveURL(/\/admin\/settings\/tribute\/automation-rules(?:\?.*)?$/);
});

test("browser history keeps the visible tab mode aligned with the route", async ({
	page,
	mockApi: _mock,
}) => {
	await page.goto(`/?${launchParams.toString()}`);
	const modeSwitch = page.getByRole("switch", { name: "Admin mode" });
	await expect(modeSwitch).toHaveAttribute("aria-checked", "false");
	await modeSwitch.focus();
	await expect(modeSwitch).toBeFocused();
	await modeSwitch.press("Space");
	await expect(page).toHaveURL(/\/admin\/dashboard$/);
	await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
	await expect(modeSwitch).toHaveAttribute("aria-checked", "true");

	await modeSwitch.click();
	await expect(page).toHaveURL(/\/$/);
	await expect(page.getByRole("link", { name: "Home" })).toBeVisible();
	await expect(modeSwitch).toHaveAttribute("aria-checked", "false");

	await page.goBack();
	await expect(page).toHaveURL(/\/admin\/dashboard$/);
	await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
	await expect(modeSwitch).toHaveAttribute("aria-checked", "true");
});

test("lazy routes survive direct loading, refresh, and browser history", async ({
	page,
	mockApi: _mock,
}) => {
	await page.goto("/");
	await expect(page.getByRole("heading", { name: "Account Info" })).toBeVisible();

	await page.getByRole("link", { name: "Devices" }).click();
	await expect(page).toHaveURL(/\/devices$/);
	await expect(page.getByRole("heading", { name: "Connected devices" })).toBeVisible();

	await page.goBack();
	await expect(page).toHaveURL(/\/$/);
	await expect(page.getByRole("heading", { name: "Account Info" })).toBeVisible();

	await page.goForward();
	await expect(page).toHaveURL(/\/devices$/);
	await expect(page.getByRole("heading", { name: "Connected devices" })).toBeVisible();

	await page.goto("/admin/settings/tribute");
	await expect(page.getByRole("heading", { name: "Setup" })).toBeVisible();
	await page.reload();
	await expect(page.getByRole("heading", { name: "Setup" })).toBeVisible();
});
