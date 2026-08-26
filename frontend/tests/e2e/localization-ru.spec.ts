import AxeBuilder from "@axe-core/playwright";
import type { Page, TestInfo } from "@playwright/test";
import { assertNoHorizontalOverflow, expect, mockData, test } from "./fixtures/mock-api.ts";

test.use({ locale: "ru-RU" });

const ALL_ADMIN_ROUTES = [
	"/admin/dashboard",
	"/admin/users",
	"/admin/users/search",
	"/admin/broadcast",
	"/admin/settings",
	"/admin/settings/pulse",
	"/admin/settings/kuma",
	"/admin/settings/beszel",
	"/admin/settings/tribute",
	"/admin/settings/tribute/connection",
	"/admin/settings/tribute/payment-links",
	"/admin/settings/tribute/referral-benefits",
	"/admin/settings/tribute/automation-rules",
	"/admin/settings/tribute/sponsor-offers",
	"/admin/settings/tribute/activity",
	"/admin/settings/communication",
	"/admin/settings/content",
	"/admin/settings/branding",
	"/admin/settings/access",
	"/admin/settings/welcome",
] as const;

const MOBILE_ADMIN_ROUTES = [
	"/admin/users",
	"/admin/settings",
	"/admin/settings/tribute/sponsor-offers",
	"/admin/settings/content",
	"/admin/settings/access",
] as const;

async function expectCompactControlsToFit(page: Page): Promise<void> {
	await page.evaluate(() => document.fonts.ready);
	const clipped = await page
		.locator("header a, header button, nav a, nav button, [role='tab']")
		.evaluateAll((elements) =>
			elements
				.filter((element) => element.scrollWidth > element.clientWidth + 1)
				.map((element) => ({
					text: element.textContent?.trim() ?? "",
					clientWidth: element.clientWidth,
					scrollWidth: element.scrollWidth,
				})),
		);
	expect(clipped, "Russian navigation and compact controls must not clip text").toEqual([]);
}

async function expectRussianSurface(page: Page): Promise<void> {
	await expect(page.getByRole("main").locator(":scope > div")).toHaveCSS("opacity", "1");
	await assertNoHorizontalOverflow(page);
	await expectCompactControlsToFit(page);
	const { violations } = await new AxeBuilder({ page }).include("main").analyze();
	expect(violations).toEqual([]);
}

async function attachScreenshot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
	await testInfo.attach(name, {
		body: await page.screenshot({ fullPage: true }),
		contentType: "image/png",
	});
}

async function gotoInTheme(page: Page, path: string, theme: "light" | "dark"): Promise<void> {
	await page.goto(path);
	await page.evaluate((value) => document.documentElement.setAttribute("data-theme", value), theme);
}

test("Russian user routes keep accepted copy and fit compact navigation", async ({
	page,
	mockApi,
}, testInfo) => {
	await page.addInitScript(() => localStorage.setItem("flowvy:mock-role", "user"));
	mockApi.mock("GET", "/api/support/articles", {
		body: {
			articles: Array.from({ length: 5 }, (_, index) => ({
				id: `61000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
				topic: "connection",
				title: index === 0 ? "Как подключить подписку" : `Статья FAQ ${index + 1}`,
				summary:
					index === 0
						? "Персональная инструкция для подключения"
						: `Краткое описание статьи ${index + 1}`,
				body: index === 0 ? "Открой инструкцию на Главной." : `Ответ ${index + 1}`,
				updatedAt: "2026-08-26T12:00:00Z",
			})),
		},
	});
	mockApi.mock("GET", "/api/me/subscription", {
		body: { ...mockData.subscription, updatedAt: Math.floor(Date.now() / 1000) - 4 * 60 },
	});

	for (const theme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });

		await gotoInTheme(page, "/", theme);
		await expect(page.locator("html")).toHaveAttribute("lang", "ru");
		await expect(page.getByRole("link", { name: "Главная" })).toBeVisible();
		await expect(page.getByRole("link", { name: "Устройства" })).toBeVisible();
		await expect(page.getByRole("link", { name: "Помощь" })).toBeVisible();
		await expect(page.getByRole("button", { name: "Инструкция по установке" })).toBeVisible();
		await expect(page.getByText("Истекает", { exact: true })).toBeVisible();
		await expect(
			page.getByText("Автоматическое обновление подписки в прокси-клиенте", { exact: true }),
		).toBeVisible();
		await expect(
			page.getByText("Интервал автоматического обновления", { exact: true }),
		).toBeVisible();
		await expect(page.getByText("Обновлено", { exact: true }).locator("..")).toContainText(
			/4 мин\.\s*Обновлено/,
		);
		await expectRussianSurface(page);
		await attachScreenshot(page, testInfo, `home-ru-${theme}`);

		await gotoInTheme(page, "/devices", theme);
		await expect(page.getByRole("heading", { name: "Подключённые устройства" })).toBeVisible();
		await page.getByRole("button", { name: "Удалить устройство" }).click();
		const deviceDialog = page.getByRole("alertdialog", { name: "Удалить устройство?" });
		await expect(deviceDialog).toContainText(
			"Устройство Pixel 8 будет удалено из списка. При следующем обновлении подписки оно может появиться снова",
		);
		await page.screenshot({
			path: testInfo.outputPath(`devices-remove-confirm-${theme}.png`),
			fullPage: true,
		});
		await deviceDialog.getByRole("button", { name: "Отмена" }).click();
		await expectRussianSurface(page);
		await attachScreenshot(page, testInfo, `devices-ru-${theme}`);

		await gotoInTheme(page, "/pulse", theme);
		await expect(page.getByText("Всё работает", { exact: true })).toBeVisible();
		await expectRussianSurface(page);

		await gotoInTheme(page, "/support", theme);
		await expect(page.getByRole("heading", { name: "FAQ" })).toBeVisible();
		await expect(page.getByRole("button", { name: "Показать ещё" })).toBeVisible();
		await expect(page.getByRole("heading", { name: "Открытые" })).toBeVisible();
		await expect(page.getByRole("button", { name: "Новый тикет" })).toBeVisible();
		await expectRussianSurface(page);
		await attachScreenshot(page, testInfo, `support-ru-${theme}`);

		await gotoInTheme(page, "/support/new", theme);
		await expect(page.getByRole("complementary")).toContainText(
			"Добавим данные аккаунта, версию Flowvy и тип устройства. Историю других тикетов и платёжные данные не добавляем, переписку за пределы этого тикета не передаём",
		);
		await page.getByLabel("Заголовок").fill("подключение подписки");
		await expect(page.getByRole("heading", { name: "Возможно, ответ уже есть" })).toBeVisible();
		await expect(page.getByRole("status")).toHaveText("Подходящих статей: 1");
		await expectRussianSurface(page);
		await attachScreenshot(page, testInfo, `support-new-suggestions-ru-${theme}`);
	}
});

test("Russian admin routes keep short labels and complete translated settings", async ({
	page,
	mockApi: _mock,
}, testInfo) => {
	testInfo.setTimeout(60_000);
	await page.addInitScript(() => localStorage.setItem("flowvy:mock-role", "admin"));
	const routes =
		testInfo.project.name === "desktop-chromium" ? ALL_ADMIN_ROUTES : MOBILE_ADMIN_ROUTES;

	for (const theme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });

		for (const path of routes) {
			await gotoInTheme(page, path, theme);
			await expectRussianSurface(page);
		}

		await gotoInTheme(page, "/admin/dashboard", theme);
		await page.getByRole("tab", { name: "Flowvy Mini App" }).click();
		await expect(page.getByText("API-запросы", { exact: true })).toHaveCount(2);
		await attachScreenshot(page, testInfo, `dashboard-api-requests-${theme}`);
		await gotoInTheme(page, "/admin/users", theme);
		await expect(page.locator("header").getByText("Юзеры", { exact: true })).toBeVisible();
		await gotoInTheme(page, "/admin/settings", theme);
		await expect(page.locator("header").getByText("Настройки", { exact: true })).toBeVisible();
		await gotoInTheme(page, "/admin/settings/communication", theme);
		await expect(page.getByRole("heading", { name: "Регистрация" })).toBeVisible();
		await expect(
			page.getByText("Каждое сообщение открывает поля для своего назначения", { exact: true }),
		).toHaveCount(0);
		await gotoInTheme(page, "/admin/settings/tribute", theme);
		await expect(page.getByRole("heading", { name: "Настройка" })).toBeVisible();
		await expect(
			page.getByText("Настройка провайдера отделена от офферов и платёжных операций", {
				exact: true,
			}),
		).toHaveCount(0);
		await gotoInTheme(page, "/admin/settings/tribute/connection", theme);
		await expect(page.getByText("API-ключ", { exact: true })).toBeVisible();
		await gotoInTheme(page, "/admin/settings/access", theme);
		await expect(page.getByRole("radio", { name: "Открытый" })).toBeChecked();
		await page.getByRole("button", { name: "Отключить профиль" }).click();
		const profileDialog = page.getByRole("dialog", { name: "Отключить профиль доступа?" });
		await expect(profileDialog).toContainText(
			"Free 30 days больше не будет доступен для новых регистраций",
		);
		await page.screenshot({
			path: testInfo.outputPath(`access-deactivate-confirm-${theme}.png`),
			fullPage: true,
		});
		await profileDialog.getByRole("button", { name: "Отмена" }).click();
		await page.getByRole("button", { name: "Создать профиль" }).click();
		await expect(page.getByRole("radio", { name: "Авто" })).toBeVisible();
		await page.getByRole("button", { name: "Закрыть редактор" }).click();
		await attachScreenshot(page, testInfo, `access-open-mode-${theme}`);
		await gotoInTheme(page, "/admin/settings/tribute/sponsor-offers", theme);
		await expect(
			page.getByRole("heading", { name: "Варианты расширенного доступа" }),
		).toBeVisible();
		if (testInfo.project.name === "desktop-chromium") {
			await attachScreenshot(page, testInfo, `extended-access-settings-ru-${theme}`);
		}
	}
});

test("Russian FAQ management uses localized article titles with English fallback", async ({
	page,
	mockApi,
}, testInfo) => {
	await page.addInitScript(() => localStorage.setItem("flowvy:mock-role", "admin"));
	mockApi.seedSupportArticles([
		{
			...mockData.supportArticles[0],
			contentLocales: {
				en: {
					title: "How to connect your subscription",
					summary: "English summary",
					body: "English answer",
				},
				ru: {
					title: "Как подключить подписку",
					summary: "Описание на русском",
					body: "Ответ на русском",
				},
			},
		},
		{
			...mockData.supportArticles[1],
			contentLocales: {
				en: {
					title: "English-only fallback",
					summary: "English summary",
					body: "English answer",
				},
			},
		},
	]);

	await page.goto("/support/manage/answers");
	await expect(page.getByText("Как подключить подписку", { exact: true })).toBeVisible();
	await expect(page.getByText("English-only fallback", { exact: true })).toBeVisible();
	await expect(page.getByText("How to connect your subscription", { exact: true })).toHaveCount(0);
	await expect(
		page.getByRole("button", { name: "Изменить Как подключить подписку" }),
	).toBeVisible();
	await expectRussianSurface(page);

	for (const theme of ["light", "dark"] as const) {
		await page.evaluate(
			(value) => document.documentElement.setAttribute("data-theme", value),
			theme,
		);
		await attachScreenshot(page, testInfo, `support-manage-titles-ru-${theme}`);
	}
});
