import { expect, test } from "./fixtures/mock-api.ts";
import { installVisualViewportMock, setTestVisualViewport } from "./fixtures/visual-viewport.ts";

test("single-line and multiline inputs keep native keyboard semantics", async ({
	page,
	mockApi: _mock,
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
	const search = page.getByRole("textbox", { name: "Search users" });
	await search.fill("alice");
	await search.press("Enter");
	await expect(search).toBeFocused();

	await page.goto("/admin/settings/access");
	await page.getByRole("button", { name: "Create profile" }).click();
	const name = page.getByLabel("Name");
	await name.focus();
	await name.press("Enter");
	await expect(name).toBeFocused();
	await expect(page.getByRole("dialog", { name: "Create access profile" })).toBeVisible();

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

test("visual viewport changes do not rewrite app geometry or hide controls", async ({
	page,
	mockApi: _mock,
}) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await installVisualViewportMock(page);
	await page.goto("/admin/settings/access");
	await page.getByRole("button", { name: "Create profile" }).click();

	const shell = page.locator('main[data-scroll-restoration-id="main-content"]').locator("..");
	const dialog = page.getByRole("dialog", { name: "Create access profile" });
	const navigation = page.getByRole("navigation");
	const footer = dialog.locator("footer");
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
	await expect(navigation).not.toHaveAttribute("aria-hidden", "true");
	await expect(footer).not.toHaveAttribute("aria-hidden", "true");
	await expect(footer).toBeVisible();
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
