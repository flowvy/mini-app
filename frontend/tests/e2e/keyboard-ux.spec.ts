import AxeBuilder from "@axe-core/playwright";
import { assertNoHorizontalOverflow, expect, mockData, test } from "./fixtures/mock-api.ts";
import {
	closeTelegramPopup,
	emitTelegramViewport,
	installTelegramMainButton,
	telegramPopups,
	withTelegramMainButton,
} from "./fixtures/telegram-main-button.ts";
import { installVisualViewportMock, setTestVisualViewport } from "./fixtures/visual-viewport.ts";

async function expectRouteSettled(page: import("@playwright/test").Page): Promise<void> {
	await expect(page.getByRole("main").locator(":scope > div")).toHaveCSS("opacity", "1");
}

test("tab navigation renders only on primary routes and leaves before focused search", async ({
	page,
	mockApi: _mock,
}) => {
	for (const path of ["/", "/devices", "/admin/dashboard", "/admin/users", "/admin/settings"]) {
		await page.goto(path);
		await expect(page.getByRole("navigation")).toBeVisible();
	}

	for (const path of [
		"/admin/users/1",
		"/admin/settings/kuma",
		"/admin/settings/access",
		"/admin/users/search",
	]) {
		await page.goto(path);
		await expectRouteSettled(page);
		await expect(page.getByRole("navigation")).toHaveCount(0);
	}

	await page.goto("/admin/users");
	await page.getByRole("button", { name: "Search users" }).click();
	await expect(page).toHaveURL(/\/admin\/users\/search$/);
	await expect(page.getByRole("navigation")).toHaveCount(0);
	await expect(page.getByRole("textbox", { name: "Search users" })).toBeFocused();
	await expect(page.getByRole("group", { name: "Filter by status" })).toBeInViewport();
	await expect(page.getByText("@alice", { exact: true })).toBeInViewport();

	await page.getByRole("button", { name: "Cancel" }).click();
	await expect(page).toHaveURL(/\/admin\/users$/);
	await expect(page.getByRole("navigation")).toBeVisible();

	await page.goto("/admin/dashboard");
	await page.getByRole("link", { name: "Users" }).click();
	await page.getByRole("button", { name: "Search users" }).click();
	await page.getByRole("button", { name: "Cancel" }).click();
	await page.goBack();
	await expect(page).toHaveURL(/\/admin\/dashboard$/);
});

test("direct focused search waits for its user list before focusing the input", async ({
	page,
	mockApi,
}) => {
	mockApi.mock("GET", "/api/debug/admin/users/all", {
		body: { users: [mockData.adminUser], total: 1 },
		delayMs: 250,
	});

	await page.goto("/admin/users/search");
	await expect(page.getByRole("navigation")).toHaveCount(0);
	await expect(page.getByRole("textbox", { name: "Search users" })).toBeFocused();
	await expect(page.getByText("@alice", { exact: true })).toBeInViewport();
});

test("text entry focus suppresses primary tab navigation before the mobile viewport changes", async ({
	page,
	mockApi: _mock,
}, testInfo) => {
	await installTelegramMainButton(page);
	await installVisualViewportMock(page);
	const hasPrimaryTouchInteraction = await page.evaluate(
		() => window.matchMedia("(hover: none) and (pointer: coarse)").matches,
	);

	for (const role of ["user", "admin"] as const) {
		await page.addInitScript((nextRole) => {
			localStorage.setItem("flowvy:mock-role", nextRole);
		}, role);
		await page.goto(withTelegramMainButton("/support"));
		const restoredViewportHeight = await page.evaluate(() => window.innerHeight);
		const navigation = page.getByRole("navigation");
		const search = page.getByRole("searchbox", {
			name: role === "user" ? "Search help" : "Search requests",
		});
		await expect(navigation).toBeVisible();
		await expect
			.poll(() =>
				page.evaluate(() =>
					getComputedStyle(document.documentElement)
						.getPropertyValue("--tg-viewport-stable-height")
						.trim(),
				),
			)
			.toBe(`${restoredViewportHeight}px`);

		await search.focus();
		await expect(search).toBeFocused();
		const keyboardViewportHeight = Math.max(240, restoredViewportHeight - 300);
		await emitTelegramViewport(page, keyboardViewportHeight, true);
		await expect
			.poll(() =>
				page.evaluate(() =>
					getComputedStyle(document.documentElement)
						.getPropertyValue("--tg-viewport-stable-height")
						.trim(),
				),
			)
			.toBe(`${keyboardViewportHeight}px`);
		if (hasPrimaryTouchInteraction) {
			await expect(navigation).toHaveCount(0);
		} else {
			await expect(navigation).toBeVisible();
		}

		await setTestVisualViewport(page, Math.max(240, restoredViewportHeight - 300), 24);
		await page.evaluate(
			() =>
				new Promise<void>((resolve) =>
					requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
				),
		);
		if (hasPrimaryTouchInteraction) {
			await expect(navigation).toHaveCount(0);
		}
		await expect(search).toBeFocused();
		for (const theme of ["light", "dark"] as const) {
			await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
			await page.evaluate(
				(nextTheme) => document.documentElement.setAttribute("data-theme", nextTheme),
				theme,
			);
			await page.evaluate(
				() =>
					new Promise<void>((resolve) =>
						requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
					),
			);
			await assertNoHorizontalOverflow(page);
			const { violations } = await new AxeBuilder({ page }).include("main").analyze();
			expect(violations).toEqual([]);
			await page.screenshot({
				path: testInfo.outputPath(
					`support-${role}-focused-search-${theme}-${testInfo.project.name}.png`,
				),
				animations: "disabled",
			});
		}

		await search.press("Enter");
		await expect(search).not.toBeFocused();
		if (hasPrimaryTouchInteraction) {
			await expect(navigation).toHaveCount(0);
		}
		await emitTelegramViewport(page, restoredViewportHeight - 120, false);
		if (hasPrimaryTouchInteraction) {
			await expect(navigation).toHaveCount(0);
		}
		await emitTelegramViewport(page, restoredViewportHeight, true);
		await setTestVisualViewport(page, restoredViewportHeight);
		await expect(navigation).toBeVisible();
	}
});

test("IME actions search, advance, finish, and preserve multiline editing", async ({
	page,
	mockApi,
}) => {
	await page.addInitScript(() => {
		const testWindow = window as typeof window & { __hideKeyboardCalls?: number };
		testWindow.__hideKeyboardCalls = 0;
		Object.defineProperty(window, "Telegram", {
			configurable: true,
			value: {
				WebApp: {
					hideKeyboard: () => {
						testWindow.__hideKeyboardCalls = (testWindow.__hideKeyboardCalls ?? 0) + 1;
					},
				},
			},
		});
	});

	await page.goto("/admin/users");
	await expect(page.getByRole("navigation")).toBeVisible();
	await page.getByRole("button", { name: "Search users" }).click();
	await expect(page).toHaveURL(/\/admin\/users\/search$/);
	await expect(page.getByRole("navigation")).toHaveCount(0);
	const search = page.getByRole("textbox", { name: "Search users" });
	await search.fill("alice");
	await search.press("Enter");
	await expect(search).not.toBeFocused();
	await expect(page.getByText("@alice", { exact: true })).toBeVisible();
	await search.fill("tg_123456789");
	await expect(page.getByText("@alice", { exact: true })).toBeVisible();

	await page.goto("/admin/settings/kuma");
	const kumaUrl = page.getByLabel("URL");
	const kumaSlug = page.getByLabel("Slug");
	await kumaUrl.focus();
	await kumaUrl.press("Enter");
	await expect(kumaSlug).toBeFocused();
	await kumaSlug.press("Enter");
	await expect(kumaSlug).not.toBeFocused();

	await page.goto("/admin/settings/access");
	await expect(page.getByRole("navigation")).toHaveCount(0);
	await page.getByRole("button", { name: "Create profile" }).click();
	const name = page.getByLabel("Name");
	await name.focus();
	await name.press("Enter");
	const days = page.getByLabel("Number of days");
	const traffic = page.getByLabel("Traffic (GB, 0 = unlimited)");
	const devices = page.getByLabel("Device limit");
	await expect(days).toBeFocused();
	await days.press("Enter");
	await expect(traffic).toBeFocused();
	await traffic.press("Enter");
	await expect(devices).toBeFocused();
	await devices.press("Enter");
	await expect(devices).not.toBeFocused();
	await expect(page.getByRole("dialog", { name: "Create access profile" })).toBeVisible();
	expect(
		mockApi.calls.filter((call) => call === "POST /api/debug/admin/registration/access-profiles"),
	).toHaveLength(0);

	await page.getByText("Advanced Remnawave fields").click();
	const description = page.getByLabel("Description");
	await description.fill("First line");
	await description.press("Enter");
	await expect(description).toBeFocused();
	await expect(description).toHaveValue("First line\n");
	await expect
		.poll(() =>
			page.evaluate(
				() => (window as typeof window & { __hideKeyboardCalls?: number }).__hideKeyboardCalls,
			),
		)
		.toBe(0);
});

test("nested task routes keep tab navigation out of the keyboard lifecycle", async ({
	page,
	mockApi: _mock,
}) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await installVisualViewportMock(page);
	await page.goto("/admin/settings/access");
	await page.getByRole("button", { name: "Create profile" }).click();

	const shell = page.locator('main[data-scroll-restoration-id="main-content"]').locator("..");
	const dialog = page.getByRole("dialog", { name: "Create access profile" });
	const name = page.getByLabel("Name");
	const restoredViewportHeight = await page.evaluate(() => window.innerHeight);

	await name.focus();
	await page.evaluate(
		() =>
			new Promise<void>((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
			),
	);
	const initialGeometry = await Promise.all([shell.boundingBox(), dialog.boundingBox()]);
	await setTestVisualViewport(page, Math.max(240, restoredViewportHeight - 300), 24);
	await page.evaluate(
		() =>
			new Promise<void>((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
			),
	);

	const shrunkGeometry = await Promise.all([shell.boundingBox(), dialog.boundingBox()]);
	expect(shrunkGeometry).toEqual(initialGeometry);
	await expect(page.getByRole("navigation")).toHaveCount(0);
	await expect(dialog.locator("footer")).toHaveCount(0);
	await expect(name).toBeFocused();
	expect(
		await page.evaluate(() => ({
			height: document.documentElement.style.getPropertyValue("--fv-visual-viewport-height"),
			offset: document.documentElement.style.getPropertyValue("--fv-visual-viewport-offset-top"),
		})),
	).toEqual({ height: "", offset: "" });

	await name.blur();
	await setTestVisualViewport(page, restoredViewportHeight);
	await page.evaluate(
		() =>
			new Promise<void>((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
			),
	);
	expect(await Promise.all([shell.boundingBox(), dialog.boundingBox()])).toEqual(initialGeometry);
});

test("native-only save actions never render DOM fallback buttons", async ({ page, mockApi }) => {
	await page.goto("/admin/settings/access");
	await page.getByRole("button", { name: "Create profile" }).click();
	const accessEditor = page.getByRole("dialog", { name: "Create access profile" });
	await expect(
		accessEditor.getByRole("button", { name: "Create profile", exact: true }),
	).toHaveCount(0);
	await expect(accessEditor.locator("footer")).toHaveCount(0);
	await accessEditor.getByRole("button", { name: "Close editor" }).click();

	for (const path of [
		"/admin/settings/kuma",
		"/admin/settings/beszel",
		"/admin/settings/branding",
		"/admin/settings/welcome",
	]) {
		await page.goto(path);
		await expectRouteSettled(page);
		await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
	}

	mockApi.seedCommerceRules([
		{
			id: "10000000-0000-4000-8000-000000000001",
			provider: "tribute",
			name: "Native-only automation rule",
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
	await page.goto("/admin/settings/tribute/automation-rules");
	await page.getByRole("button", { name: /Native-only automation rule/ }).click();
	const ruleEditor = page.getByRole("dialog", { name: "Edit automation rule" });
	await expect(ruleEditor.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
	await ruleEditor.getByRole("button", { name: "Close rule editor" }).click();

	await page.goto("/admin/settings/tribute/sponsor-offers");
	await page.getByRole("button", { name: "Create first offer" }).click();
	const offerEditor = page.getByRole("dialog", { name: "Create sponsor offer" });
	await expect(offerEditor.getByRole("button", { name: "Create offer", exact: true })).toHaveCount(
		0,
	);
	await expect(offerEditor.locator("footer")).toHaveCount(0);
});

test("supported Telegram clients receive native editor bottom buttons", async ({
	page,
	mockApi: _mock,
}) => {
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
	const launchParams = new URLSearchParams({
		tgWebAppPlatform: "ios",
		tgWebAppVersion: "9.6",
		tgWebAppThemeParams: JSON.stringify({
			bg_color: "#171717",
			button_color: "#31d58b",
			button_text_color: "#111111",
			bottom_bar_bg_color: "#171717",
		}),
	});

	await page.goto(`/admin/settings/access?${launchParams.toString()}`);
	await page.getByRole("button", { name: "Create profile" }).click();
	const dialog = page.getByRole("dialog", { name: "Create access profile" });
	await expect(dialog).toBeVisible();

	await expect
		.poll(() =>
			page.evaluate(() => {
				const telegramWindow = window as typeof window & {
					__telegramEvents?: Array<{ eventType: string; eventData?: string }>;
				};
				return telegramWindow.__telegramEvents
					?.filter(
						(event) =>
							event.eventType === "web_app_setup_main_button" ||
							event.eventType === "web_app_setup_secondary_button",
					)
					.map((event) => ({
						eventType: event.eventType,
						data: event.eventData ? JSON.parse(event.eventData) : null,
					}));
			}),
		)
		.toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					eventType: "web_app_setup_main_button",
					data: expect.objectContaining({
						text: "Create profile",
						is_active: false,
						is_visible: true,
						color: "#747474",
						text_color: "#171717",
					}),
				}),
			]),
		);
	expect(
		await page.evaluate(() => {
			const telegramWindow = window as typeof window & {
				__telegramEvents?: Array<{ eventType: string }>;
			};
			return telegramWindow.__telegramEvents?.some(
				(event) => event.eventType === "web_app_setup_secondary_button",
			);
		}),
	).toBe(false);
	await expect(dialog.locator("footer")).toHaveCount(0);
	await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
	await expect
		.poll(() =>
			page.evaluate(() => {
				const telegramWindow = window as typeof window & {
					__telegramEvents?: Array<{ eventType: string; eventData?: string }>;
				};
				const mainEvents = telegramWindow.__telegramEvents?.filter(
					(event) => event.eventType === "web_app_setup_main_button",
				);
				const eventData = mainEvents?.at(-1)?.eventData;
				return eventData ? JSON.parse(eventData) : null;
			}),
		)
		.toEqual(expect.objectContaining({ color: "#9a9a9a", text_color: "#f7f7f7" }));
	await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));

	await page.getByLabel("Name").fill("Native buttons profile");
	await expect
		.poll(() =>
			page.evaluate(() => {
				const telegramWindow = window as typeof window & {
					__telegramEvents?: Array<{ eventType: string; eventData?: string }>;
				};
				const mainEvents = telegramWindow.__telegramEvents?.filter(
					(event) => event.eventType === "web_app_setup_main_button",
				);
				const eventData = mainEvents?.at(-1)?.eventData;
				return eventData ? JSON.parse(eventData) : null;
			}),
		)
		.toEqual(
			expect.objectContaining({
				is_active: true,
				is_visible: true,
				color: "#ffffff",
				text_color: "#171717",
			}),
		);

	await page.getByRole("button", { name: "Close editor" }).click();
	await expect(dialog).toHaveCount(0);
	await expect
		.poll(() =>
			page.evaluate(() => {
				const telegramWindow = window as typeof window & {
					__telegramEvents?: Array<{ eventType: string; eventData?: string }>;
				};
				const mainEvents = telegramWindow.__telegramEvents?.filter(
					(event) => event.eventType === "web_app_setup_main_button",
				);
				const eventData = mainEvents?.at(-1)?.eventData;
				return eventData ? JSON.parse(eventData) : null;
			}),
		)
		.toEqual(expect.objectContaining({ is_visible: false }));
});

test("dedicated settings routes use one native save action with modal-safe cleanup", async ({
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
	const launchParams = new URLSearchParams({
		tgWebAppPlatform: "ios",
		tgWebAppVersion: "9.6",
		tgWebAppThemeParams: JSON.stringify({
			bg_color: "#171717",
			button_color: "#31d58b",
			button_text_color: "#111111",
			bottom_bar_bg_color: "#171717",
		}),
	});
	const latestMainButton = () =>
		page.evaluate(() => {
			const telegramWindow = window as typeof window & {
				__telegramEvents?: Array<{ eventType: string; eventData?: string }>;
			};
			const mainEvents = telegramWindow.__telegramEvents?.filter(
				(event) => event.eventType === "web_app_setup_main_button",
			);
			const eventData = mainEvents?.at(-1)?.eventData;
			return eventData ? JSON.parse(eventData) : null;
		});

	await page.goto(`/admin/settings?${launchParams.toString()}`);
	await page.getByRole("button", { name: /^Pulse monitoring/ }).click();
	await page.getByRole("button", { name: /^Beszel Hub and read-only access/ }).click();
	await expect(page).toHaveURL(/\/admin\/settings\/beszel$/);
	await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
	await expect
		.poll(latestMainButton)
		.toEqual(expect.objectContaining({ text: "Save", is_active: false, is_visible: true }));

	const urlInput = page.getByLabel("Hub URL");
	await urlInput.fill("https://native-save.example.test");
	await expect
		.poll(latestMainButton)
		.toEqual(expect.objectContaining({ text: "Save", is_active: true, is_visible: true }));

	await page.evaluate(() => window.history.back());
	const discardDialog = page.getByRole("dialog", { name: "Discard changes?" });
	await expect(discardDialog).toHaveCount(0);
	await expect.poll(async () => (await telegramPopups(page)).length).toBe(1);
	await expect.poll(latestMainButton).toEqual(expect.objectContaining({ is_visible: false }));
	await closeTelegramPopup(page, "cancel");
	await expect
		.poll(latestMainButton)
		.toEqual(expect.objectContaining({ is_active: true, is_visible: true }));

	await page.evaluate(() => {
		const telegramWindow = window as typeof window & {
			Telegram?: { WebView?: { receiveEvent?: (event: string) => void } };
		};
		telegramWindow.Telegram?.WebView?.receiveEvent?.("main_button_pressed");
	});
	await expect
		.poll(() => mockApi.calls.filter((call) => call === "PATCH /api/debug/admin/settings").length)
		.toBe(1);
	await expect
		.poll(latestMainButton)
		.toEqual(expect.objectContaining({ is_active: false, is_visible: true }));
	await page.getByRole("switch", { name: "Admin mode" }).click();
	await expect(page).toHaveURL(/\/$/);
	await expect.poll(latestMainButton).toEqual(expect.objectContaining({ is_visible: false }));

	await page.goto(`/admin/settings/tribute/payment-links?${launchParams.toString()}`);
	await expect(page.getByRole("button", { name: "Save payment links", exact: true })).toBeVisible();
	await expect.poll(latestMainButton).toBeNull();

	await page.goto(`/admin/settings/tribute/automation-rules?${launchParams.toString()}`);
	await page.getByRole("button", { name: /Monthly donation access/ }).click();
	const ruleEditor = page.getByRole("dialog", { name: "Edit automation rule" });
	await expect(ruleEditor).toBeVisible();
	await expect
		.poll(latestMainButton)
		.toEqual(expect.objectContaining({ text: "Save", is_active: true, is_visible: true }));
	await ruleEditor.getByRole("button", { name: "Delete", exact: true }).click();
	const deleteDialog = page.getByRole("dialog", { name: "Delete automation rule?" });
	await expect(deleteDialog).toHaveCount(0);
	await expect.poll(async () => (await telegramPopups(page)).length).toBe(1);
	await expect.poll(latestMainButton).toEqual(expect.objectContaining({ is_visible: false }));
	await closeTelegramPopup(page, "cancel");
	await expect.poll(latestMainButton).toEqual(expect.objectContaining({ is_visible: true }));
});
