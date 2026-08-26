import AxeBuilder from "@axe-core/playwright";
import { assertNoHorizontalOverflow, expect, mockData, test } from "./fixtures/mock-api.ts";
import {
	closeTelegramPopup,
	installTelegramMainButton,
	telegramPopups,
	withTelegramMainButton,
} from "./fixtures/telegram-main-button.ts";

async function useUserRole(page: import("@playwright/test").Page): Promise<void> {
	await page.addInitScript(() => localStorage.setItem("flowvy:mock-role", "user"));
}

async function selectEditorContents(editor: import("@playwright/test").Locator): Promise<void> {
	await editor.evaluate((element) => {
		const selection = window.getSelection();
		if (!selection) throw new Error("Selection API is unavailable");
		const range = document.createRange();
		range.selectNodeContents(element);
		selection.removeAllRanges();
		selection.addRange(range);
		document.dispatchEvent(new Event("selectionchange"));
	});
}

test("user Support keeps the accepted section order and opens Quick Answers", async ({
	page,
	mockApi: _mock,
}) => {
	await useUserRole(page);
	await page.goto("/support");
	await expect(page.locator("header").getByRole("button", { name: "Create request" })).toHaveCount(
		0,
	);

	const headings = page.locator("main h1, main h2");
	await expect(headings).toHaveText([
		"Quick Answers",
		"Active Requests",
		"Resolved",
		"Need a hand?",
	]);
	await expect(page.getByText("Connection stopped working", { exact: true })).toBeVisible();
	await expect(page.getByText("Subscription renewal", { exact: true })).toBeVisible();
	await expect(page.locator('[data-request-status-icon="needs_reply"]')).toHaveAttribute(
		"data-tone",
		"neutral",
	);
	await expect(page.locator('[data-request-status-icon="waiting_user"]')).toHaveAttribute(
		"data-tone",
		"attention",
	);

	const helpSearch = page.getByRole("searchbox", { name: "Search help" });
	await expect(helpSearch).toHaveAttribute("inputmode", "search");
	await expect(helpSearch).toHaveAttribute("enterkeyhint", "search");
	await helpSearch.fill("new device");
	await helpSearch.press("Enter");
	await expect(helpSearch).not.toBeFocused();
	await expect(page.getByRole("button", { name: /Set up Flowvy on a new device/ })).toBeVisible();
	await expect(page.getByRole("button", { name: /Connection does not work/ })).toHaveCount(0);
	await page.getByRole("button", { name: /Set up Flowvy on a new device/ }).click();
	await expect(page).toHaveURL(/\/support\/answers\/61000000-0000-4000-8000-000000000002$/);
	await expect(page.locator("header").getByText("Quick Answer", { exact: true })).toBeVisible();
	await expect(page.getByRole("heading", { name: "Set up Flowvy on a new device" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Create request" })).toBeVisible();
	await assertNoHorizontalOverflow(page);
});

test("Quick Answers wraps long titles and uses neutral topic icons", async ({
	page,
	mockApi,
}, testInfo) => {
	mockApi.mock("GET", "/api/support/articles", {
		body: {
			articles: [
				{
					id: "61000000-0000-4000-8000-000000000001",
					topic: "connection",
					title: "Как подключить подписку",
					summary: "Открой персональную инструкцию с Главной.",
					body: "Инструкция по подключению.",
					updatedAt: "2026-08-26T12:00:00Z",
				},
				{
					id: "61000000-0000-4000-8000-000000000002",
					topic: "subscription",
					title: "Ссылка подписки не открывается или не загружается",
					summary: "Проверь статус подписки и обнови ссылку.",
					body: "Инструкция по обновлению подписки.",
					updatedAt: "2026-08-26T12:00:00Z",
				},
			],
		},
	});

	await useUserRole(page);
	await page.goto("/support");
	const connectionArticle = page.getByRole("button", { name: /Как подключить подписку/ });
	const subscriptionArticle = page.getByRole("button", {
		name: /Ссылка подписки не открывается или не загружается/,
	});
	await expect(connectionArticle.locator("svg").first()).toHaveClass(/lucide-cable/);
	await expect(subscriptionArticle.locator("svg").first()).toHaveClass(/lucide-link/);

	const longTitle = subscriptionArticle.locator("strong");
	const titleLayout = await longTitle.evaluate((element) => {
		const styles = getComputedStyle(element);
		return {
			clientHeight: element.clientHeight,
			lineHeight: Number.parseFloat(styles.lineHeight),
			scrollHeight: element.scrollHeight,
			whiteSpace: styles.whiteSpace,
		};
	});
	expect(titleLayout.whiteSpace).toBe("normal");
	expect(titleLayout.scrollHeight).toBeLessThanOrEqual(titleLayout.clientHeight + 1);
	if ((page.viewportSize()?.width ?? 0) <= 430) {
		expect(titleLayout.clientHeight).toBeGreaterThanOrEqual(titleLayout.lineHeight * 1.8);
	}
	await assertNoHorizontalOverflow(page);

	for (const theme of ["light", "dark"] as const) {
		await page.evaluate(
			(value) => document.documentElement.setAttribute("data-theme", value),
			theme,
		);
		await page.locator("main").screenshot({
			path: testInfo.outputPath(`support-answer-list-${theme}-${testInfo.project.name}.png`),
			animations: "disabled",
		});
		const { violations } = await new AxeBuilder({ page }).include("main").analyze();
		expect(violations).toEqual([]);
	}
});

test("Quick Answers reveals four more articles at a time and searches the full feed", async ({
	page,
	mockApi,
}, testInfo) => {
	const articles = Array.from({ length: 10 }, (_, index) => ({
		id: `61000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
		topic: index % 2 === 0 ? ("connection" as const) : ("devices" as const),
		title: `FAQ article ${index + 1}`,
		summary: `Summary for article ${index + 1}`,
		body: `Detailed answer ${index + 1}`,
		updatedAt: "2026-08-26T12:00:00Z",
	}));
	mockApi.mock("GET", "/api/support/articles", { body: { articles } });

	await useUserRole(page);
	await page.goto("/support");
	const showMore = page.getByRole("button", { name: "Show more" });
	await expect(page.getByRole("button", { name: /FAQ article 4/ })).toBeVisible();
	await expect(page.getByRole("button", { name: /FAQ article 5/ })).toHaveCount(0);
	await expect(showMore).toBeVisible();
	await assertNoHorizontalOverflow(page);

	for (const theme of ["light", "dark"] as const) {
		await page.evaluate(
			(value) => document.documentElement.setAttribute("data-theme", value),
			theme,
		);
		await page.locator("main").screenshot({
			path: testInfo.outputPath(
				`support-answer-pagination-initial-${theme}-${testInfo.project.name}.png`,
			),
			animations: "disabled",
		});
		const { violations } = await new AxeBuilder({ page }).include("main").analyze();
		expect(violations).toEqual([]);
	}

	await showMore.click();
	await expect(page.getByRole("button", { name: /FAQ article 8/ })).toBeVisible();
	await expect(page.getByRole("button", { name: /FAQ article 9/ })).toHaveCount(0);

	const search = page.getByRole("searchbox", { name: "Search help" });
	await search.fill("article 10");
	await expect(page.getByRole("button", { name: /FAQ article 10/ })).toBeVisible();
	await expect(page.getByRole("button", { name: /^FAQ article 1\b/ })).toHaveCount(0);
	await expect(showMore).toHaveCount(0);

	await search.fill("");
	await expect(page.getByRole("button", { name: /FAQ article 4/ })).toBeVisible();
	await expect(page.getByRole("button", { name: /FAQ article 5/ })).toHaveCount(0);
	await showMore.click();
	await showMore.click();
	await expect(page.getByRole("button", { name: /FAQ article 10/ })).toBeVisible();
	await expect(showMore).toHaveCount(0);
	await assertNoHorizontalOverflow(page);
});

test("published article renders Markdown lists at readable width", async ({
	page,
	mockApi,
}, testInfo) => {
	const articleId = "61000000-0000-4000-8000-000000000002";
	mockApi.mock("GET", `/api/support/articles/${articleId}`, {
		body: {
			id: articleId,
			topic: "connection",
			title: "Как подключить подписку",
			summary: "Открой персональную инструкцию с Главной.",
			body: [
				"Подписка подключается через персональную страницу с инструкцией.",
				"",
				"1. Открой **Главную** в Flowvy.",
				"2. Нажми **Инструкция по установке**.",
				"3. Страница определит платформу и покажет подходящие приложения.",
				"",
				"- Выбери приложение.",
				"- Импортируй подписку.",
			].join("\n"),
			updatedAt: "2026-08-26T12:00:00Z",
		},
	});

	await useUserRole(page);
	await page.goto(`/support/answers/${articleId}`);
	await expect(page.getByRole("heading", { name: "Как подключить подписку" })).toBeVisible();
	await expect(page.getByText("Инструкция по установке", { exact: true })).toBeVisible();

	const listItems = page.locator("article li");
	await expect(listItems).toHaveCount(5);
	const itemLayout = await listItems.evaluateAll((items) =>
		items.map((item) => ({
			display: getComputedStyle(item).display,
			width: item.getBoundingClientRect().width,
		})),
	);
	expect(itemLayout.every(({ display }) => display === "list-item")).toBe(true);
	expect(itemLayout.every(({ width }) => width >= 150)).toBe(true);
	await assertNoHorizontalOverflow(page);

	for (const theme of ["light", "dark"] as const) {
		await page.evaluate(
			(value) => document.documentElement.setAttribute("data-theme", value),
			theme,
		);
		await page.locator("article").screenshot({
			path: testInfo.outputPath(`support-article-lists-${theme}-${testInfo.project.name}.png`),
			animations: "disabled",
		});
		const { violations } = await new AxeBuilder({ page }).include("article").analyze();
		expect(violations).toEqual([]);
	}
});

test("administrator manages article order and opens the existing editor", async ({
	page,
	mockApi,
}, testInfo) => {
	await page.goto("/support");
	await expect(
		page.locator("header").getByRole("button", { name: "Manage Quick Answers" }),
	).toHaveCount(0);
	await page
		.locator("main")
		.getByRole("button", { name: /Manage Quick Answers/ })
		.click();
	await expect(page).toHaveURL(/\/support\/manage\/answers$/);
	await expect(page.locator("header").getByText("Quick Answers", { exact: true })).toBeVisible();
	await expect(page.getByRole("heading", { name: "Articles" })).toBeVisible();
	await expect(page.getByText(/published · .*drafts · .*archived/)).toHaveCount(0);
	await expect(page.getByText("Refresh a subscription profile", { exact: true })).toBeVisible();
	for (const theme of ["light", "dark"] as const) {
		await page.evaluate(
			(value) => document.documentElement.setAttribute("data-theme", value),
			theme,
		);
		await page.screenshot({
			path: testInfo.outputPath(`support-answers-manage-${theme}-${testInfo.project.name}.png`),
			fullPage: true,
			animations: "disabled",
		});
		const { violations } = await new AxeBuilder({ page }).include("main").analyze();
		expect(violations).toEqual([]);
	}

	await page.getByRole("button", { name: "Move Connection does not work down" }).click();
	await expect
		.poll(() => mockApi.calls.filter((call) => call.endsWith("/support/articles/order/all")).length)
		.toBe(1);
	await expect(page.locator('[data-support-manage="list"] strong').first()).toHaveText(
		"Set up Flowvy on a new device",
	);

	await page.getByRole("button", { name: "Edit Refresh a subscription profile" }).click();
	await expect(page).toHaveURL(/\/support\/manage\/answers\/61000000-0000-4000-8000-000000000003$/);
	await expect(page.locator("header").getByText("Edit article", { exact: true })).toBeVisible();
	await expect(page.getByLabel("Title")).toHaveValue("Refresh a subscription profile");
	await expect(page.getByRole("textbox", { name: "Article" })).toContainText(
		"Open the subscription menu",
	);
	await expect(page.getByText("46/10000", { exact: true })).toBeVisible();
	await page.screenshot({
		path: testInfo.outputPath(`support-article-editor-dark-${testInfo.project.name}.png`),
		fullPage: true,
		animations: "disabled",
	});
	await assertNoHorizontalOverflow(page);
});

test("article language tabs stay centered", async ({ page }, testInfo) => {
	await page.goto("/support/manage/answers/new");
	const language = page.getByRole("group", { name: "Language" });
	await expect(language.getByRole("radio", { name: "English" })).toBeChecked();
	await expect(language.getByRole("radio", { name: "Russian" })).not.toBeChecked();

	const centerDeltas = await language.locator("label").evaluateAll((labels) =>
		labels.map((label) => {
			const text = label.querySelector("span");
			if (!text) throw new Error("Segment label text is missing");
			const segmentBox = label.getBoundingClientRect();
			const textBox = text.getBoundingClientRect();
			return Math.abs(segmentBox.left + segmentBox.width / 2 - (textBox.left + textBox.width / 2));
		}),
	);
	expect(centerDeltas.every((delta) => delta <= 1)).toBe(true);
	await assertNoHorizontalOverflow(page);

	for (const theme of ["light", "dark"] as const) {
		await page.evaluate(
			(value) => document.documentElement.setAttribute("data-theme", value),
			theme,
		);
		await language.screenshot({
			path: testInfo.outputPath(`support-article-language-${theme}-${testInfo.project.name}.png`),
			animations: "disabled",
		});
		const { violations } = await new AxeBuilder({ page })
			.include('[aria-label="Language"]')
			.analyze();
		expect(violations).toEqual([]);
	}
});

test("administrator follows the explicit article lifecycle and deletes the article", async ({
	page,
	mockApi,
}, testInfo) => {
	await page.goto("/support/manage/answers");
	await page.getByRole("button", { name: "Create article" }).click();
	await expect(page.locator("header").getByText("New article", { exact: true })).toBeVisible();
	const status = page.getByLabel("Status");
	await expect(status).toHaveValue("draft");
	await expect(status.locator('option[value="archived"]')).toHaveCount(0);
	await expect(page.getByRole("button", { name: "Save draft" })).toBeDisabled();
	await page.getByLabel("Title").fill("Fix DNS resolution");
	await page.getByLabel("Short description").fill("Check DNS settings before opening a request.");
	await page.getByLabel("Search phrases").fill("internet is down, connection timeout");
	const body = page.getByRole("textbox", { name: "Article" });
	await body.focus();
	await body.pressSequentially(
		"Restart Flowvy Desktop, then reconnect. Never share an access key.",
	);
	const language = page.getByRole("group", { name: "Language" });
	await language.getByRole("radio", { name: "Russian" }).click();
	await page.getByLabel("Title").fill("Исправить DNS");
	await page.getByLabel("Short description").fill("Проверь настройки DNS перед созданием тикета.");
	await page.getByLabel("Search phrases").fill("нет интернета, не работает впн");
	await page
		.getByRole("textbox", { name: "Article" })
		.fill("Перезапусти Flowvy Desktop и подключись снова.");
	await language.getByRole("radio", { name: "English" }).click();
	await expect(page.getByRole("button", { name: "Save draft" })).toBeEnabled();
	await status.selectOption("published");
	await expect(page.getByRole("button", { name: "Publish" })).toBeEnabled();
	const createRequest = page.waitForRequest(
		(request) =>
			request.method() === "POST" &&
			new URL(request.url()).pathname === "/api/debug/admin/support/articles",
	);
	await page.getByRole("button", { name: "Publish" }).click();
	const createPayload = (await createRequest).postDataJSON();
	expect(createPayload.contentLocales.en.title).toBe("Fix DNS resolution");
	expect(createPayload.contentLocales.ru.title).toBe("Исправить DNS");
	expect(createPayload.contentLocales.en.searchAliases).toEqual([
		"internet is down",
		"connection timeout",
	]);
	expect(createPayload.contentLocales.ru.searchAliases).toEqual([
		"нет интернета",
		"не работает впн",
	]);
	await expect(page).toHaveURL(/\/support\/manage\/answers\/61000000-0000-4000-8000-000000000004$/);
	await expect(page.getByRole("button", { name: "Publish", exact: true })).toHaveCount(0);
	await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled();
	await expect(status).toHaveValue("published");
	await expect(status.locator("option")).toHaveText(["Draft", "Published", "Archived"]);
	const contentActions = page.locator('[data-ui="article-content-actions"]');
	await expect(contentActions.getByRole("button")).toHaveCount(2);
	await expect(contentActions.getByRole("button", { name: "Save changes" })).toBeVisible();
	await expect(contentActions.getByRole("button", { name: "Delete article" })).toBeVisible();
	await expect(page.getByText("Visible to users in Quick Answers", { exact: true })).toBeVisible();
	for (const theme of ["light", "dark"] as const) {
		await page.evaluate(
			(value) => document.documentElement.setAttribute("data-theme", value),
			theme,
		);
		await page.getByRole("button", { name: "Delete article" }).scrollIntoViewIfNeeded();
		await page.screenshot({
			path: testInfo.outputPath(`support-article-published-${theme}-${testInfo.project.name}.png`),
			animations: "disabled",
		});
		const { violations } = await new AxeBuilder({ page }).include("main").analyze();
		expect(violations).toEqual([]);
	}
	await expect
		.poll(
			() =>
				mockApi.calls.filter((call) => call === "POST /api/debug/admin/support/articles").length,
		)
		.toBe(1);

	await page.getByLabel("Short description").fill("Check DNS settings, then reconnect.");
	await expect(page.getByRole("button", { name: "Save changes" })).toBeEnabled();
	await page.getByRole("button", { name: "Save changes" }).click();
	await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled();
	await status.selectOption("draft");
	await page.getByRole("button", { name: "Save changes" }).click();
	await expect(status).toHaveValue("draft");
	await expect(status.locator('option[value="archived"]')).toHaveCount(0);
	await status.selectOption("published");
	await page.getByRole("button", { name: "Save changes" }).click();
	await expect(status).toHaveValue("published");
	await status.selectOption("archived");
	await page.getByRole("button", { name: "Save changes" }).click();
	await expect(status).toHaveValue("archived");
	await expect(status.locator('option[value="published"]')).toHaveCount(0);
	await status.selectOption("draft");
	await page.getByRole("button", { name: "Save changes" }).click();
	await expect(status).toHaveValue("draft");
	await expect
		.poll(
			() =>
				mockApi.calls.filter(
					(call) =>
						call === "PUT /api/debug/admin/support/articles/61000000-0000-4000-8000-000000000004",
				).length,
		)
		.toBe(5);

	await page.getByRole("button", { name: "Delete article", exact: true }).click();
	let confirmation = page.getByRole("alertdialog", { name: "Delete article?" });
	await expect(confirmation).toContainText(
		"This article will be permanently deleted. This cannot be undone",
	);
	await page.screenshot({
		path: testInfo.outputPath(`support-article-delete-dark-${testInfo.project.name}.png`),
		animations: "disabled",
	});
	const { violations } = await new AxeBuilder({ page }).include("dialog").analyze();
	expect(violations).toEqual([]);
	await confirmation.getByRole("button", { name: "Cancel" }).click();
	await expect(confirmation).toHaveCount(0);
	await page.getByRole("button", { name: "Delete article", exact: true }).click();
	confirmation = page.getByRole("alertdialog", { name: "Delete article?" });
	await confirmation.getByRole("button", { name: "Delete", exact: true }).click();
	await expect(page).toHaveURL(/\/support\/manage\/answers$/);
	await expect(page.getByText("Fix DNS resolution", { exact: true })).toHaveCount(0);
	await expect
		.poll(
			() =>
				mockApi.calls.filter(
					(call) =>
						call ===
						"DELETE /api/debug/admin/support/articles/61000000-0000-4000-8000-000000000004",
				).length,
		)
		.toBe(1);
	await assertNoHorizontalOverflow(page);
});

test("article deletion failure stays actionable and does not expose backend diagnostics", async ({
	page,
	mockApi,
}) => {
	const articleId = "61000000-0000-4000-8000-000000000003";
	mockApi.mock("DELETE", `/api/debug/admin/support/articles/${articleId}`, {
		status: 503,
		body: { detail: "private database diagnostic" },
		delayMs: 400,
	});
	await page.goto(`/support/manage/answers/${articleId}`);
	await page.getByRole("button", { name: "Delete article", exact: true }).click();
	const confirmation = page.getByRole("alertdialog", { name: "Delete article?" });
	const deleteButton = confirmation.getByRole("button", { name: "Delete", exact: true });
	await deleteButton.click();
	await expect(deleteButton).toHaveAttribute("aria-busy", "true");
	await expect(deleteButton).toBeDisabled();
	await expect(confirmation.getByRole("alert")).toContainText(
		"The article was not deleted. Try again",
	);
	await expect(confirmation.getByText("private database diagnostic")).toHaveCount(0);
	await expect(page).toHaveURL(new RegExp(`/support/manage/answers/${articleId}$`));
});

test("Telegram article deletion uses a native popup and leaves no WebKit dialog layer", async ({
	page,
	mockApi,
}, testInfo) => {
	const articleId = "61000000-0000-4000-8000-000000000003";
	await installTelegramMainButton(page);
	await page.goto(withTelegramMainButton(`/support/manage/answers/${articleId}`));
	await page.getByRole("button", { name: "Delete article", exact: true }).click();

	await expect(page.getByRole("alertdialog", { name: "Delete article?" })).toHaveCount(0);
	await expect
		.poll(() => telegramPopups(page))
		.toEqual([
			{
				title: "Delete article?",
				message: "This article will be permanently deleted. This cannot be undone",
				buttons: [
					{ id: "confirm", text: "Delete", type: "destructive" },
					{ id: "cancel", text: "Cancel", type: "default" },
				],
			},
		]);

	await closeTelegramPopup(page, "confirm");
	await expect(page).toHaveURL(/\/support\/manage\/answers(?:\?.*)?$/);
	await expect
		.poll(
			() =>
				mockApi.calls.filter(
					(call) => call === `DELETE /api/debug/admin/support/articles/${articleId}`,
				).length,
		)
		.toBe(1);
	await expect(page.locator("dialog")).toHaveCount(0);
	await assertNoHorizontalOverflow(page);
	await page.screenshot({
		path: testInfo.outputPath(`support-after-native-delete-${testInfo.project.name}.png`),
		animations: "disabled",
	});
});

test("Telegram article deletion reopens the native confirmation with a safe retry error", async ({
	page,
	mockApi,
}) => {
	const articleId = "61000000-0000-4000-8000-000000000003";
	mockApi.mock("DELETE", `/api/debug/admin/support/articles/${articleId}`, {
		status: 503,
		body: { detail: "private database diagnostic" },
	});
	await installTelegramMainButton(page);
	await page.goto(withTelegramMainButton(`/support/manage/answers/${articleId}`));
	await page.getByRole("button", { name: "Delete article", exact: true }).click();
	await expect.poll(async () => (await telegramPopups(page)).length).toBe(1);

	await closeTelegramPopup(page, "confirm");
	await expect.poll(async () => (await telegramPopups(page)).length).toBe(2);
	const popups = await telegramPopups(page);
	expect(popups[1]).toEqual({
		title: "Delete article?",
		message:
			"The article was not deleted. Try again\n\nThis article will be permanently deleted. This cannot be undone",
		buttons: [
			{ id: "confirm", text: "Delete", type: "destructive" },
			{ id: "cancel", text: "Cancel", type: "default" },
		],
	});
	expect(JSON.stringify(popups[1])).not.toContain("private database diagnostic");
	await closeTelegramPopup(page, "cancel");
	await expect(page).toHaveURL(new RegExp(`/support/manage/answers/${articleId}(?:\\?.*)?$`));
});

test("article editor protects unsaved changes and exposes persistent save failure", async ({
	page,
	mockApi,
}) => {
	mockApi.mock("POST", "/api/debug/admin/support/articles", {
		status: 503,
		body: { detail: "Unavailable" },
	});
	await page.goto("/support/manage/answers");
	await page.getByRole("button", { name: "Create article" }).click();
	await page.getByLabel("Title").fill("Unsaved article");
	await page.getByRole("button", { name: "Save draft" }).click();
	await expect(
		page.getByText("The article was not saved. Check the required fields and try again", {
			exact: true,
		}),
	).toBeVisible();

	await page.goBack();
	await expect(page.getByRole("heading", { name: "Discard article changes?" })).toBeVisible();
	await page.getByRole("button", { name: "Cancel" }).click();
	await expect(page).toHaveURL(/\/support\/manage\/answers\/new$/);
	await page.goBack();
	await page.getByRole("button", { name: "Discard changes" }).click();
	await expect(page).toHaveURL(/\/support\/manage\/answers$/);
});

test("Quick Answers has independent unavailable and empty states", async ({ page, mockApi }) => {
	await useUserRole(page);
	mockApi.mock("GET", "/api/support/articles", [
		{ status: 503, body: { detail: "Unavailable" } },
		{ status: 503, body: { detail: "Unavailable" } },
		{ body: { articles: [] } },
	]);
	await page.goto("/support");
	await expect(page.getByText("Quick Answers are unavailable right now")).toBeVisible();
	await page.getByRole("button", { name: "Retry" }).first().click();
	await expect(page.getByText("No published answers yet")).toBeVisible();
	await expect(page.getByText("Connection stopped working", { exact: true })).toBeVisible();
});

test("article and management direct URLs fail closed for missing content and non-admins", async ({
	page,
	mockApi: _mock,
}) => {
	await useUserRole(page);
	await page.goto("/support/answers/61000000-0000-4000-8000-000000000003");
	await expect(page.getByRole("heading", { name: "Answer not found" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Back to Support" })).toBeVisible();

	await page.goto("/support/manage/answers");
	await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
	await expect(page.getByText("This section is available to administrators only")).toBeVisible();
});

test("new request suggests related FAQ answers without replacing or losing the draft", async ({
	page,
	mockApi: _mock,
}, testInfo) => {
	await useUserRole(page);
	await page.goto("/support/new");
	const subject = page.getByLabel("Subject");
	const message = page.getByRole("textbox", { name: "What happened?" });

	await subject.fill("ne");
	await expect(page.getByRole("heading", { name: "Your answer may already be here" })).toHaveCount(
		0,
	);
	await subject.fill("new device connection");
	await expect(page.getByRole("status")).toHaveText("Matching FAQ articles: 2");
	await expect(
		page.getByRole("heading", { name: "Your answer may already be here" }),
	).toBeVisible();
	const deviceSuggestion = page.locator("summary").filter({
		hasText: "Set up Flowvy on a new device",
	});
	const connectionSuggestion = page.locator("summary").filter({
		hasText: "Connection does not work",
	});
	await expect(deviceSuggestion).toBeVisible();
	await expect(connectionSuggestion).toBeVisible();
	await expect(page.locator("summary").first()).toContainText("Set up Flowvy on a new device");

	await message.fill("I still need help after trying the FAQ steps.");
	await subject.focus();
	await subject.press("Tab");
	await expect(deviceSuggestion).toBeFocused();
	await deviceSuggestion.press("Enter");
	await expect(
		page.getByText("Add the new device by opening Flowvy", { exact: false }),
	).toBeVisible();
	await expect(subject).toHaveValue("new device connection");
	await expect(message).toContainText("I still need help after trying the FAQ steps.");
	await assertNoHorizontalOverflow(page);

	for (const theme of ["light", "dark"] as const) {
		await page.evaluate(
			(value) => document.documentElement.setAttribute("data-theme", value),
			theme,
		);
		await page.locator("main").screenshot({
			path: testInfo.outputPath(`support-new-suggestions-${theme}-${testInfo.project.name}.png`),
			animations: "disabled",
		});
		const { violations } = await new AxeBuilder({ page }).include("main").analyze();
		expect(violations).toEqual([]);
	}
});

test("FAQ suggestion failure never blocks a new request", async ({ page, mockApi }) => {
	await useUserRole(page);
	mockApi.mock("GET", "/api/support/articles/suggestions", {
		status: 503,
		body: { detail: "Unavailable" },
	});
	await page.goto("/support/new");
	await page.getByLabel("Subject").fill("Connection does not work");
	await page.getByRole("textbox", { name: "What happened?" }).fill("The connection times out.");
	await expect(page.getByRole("button", { name: "Send request" })).toBeEnabled();
	await expect(page.getByRole("heading", { name: "Your answer may already be here" })).toHaveCount(
		0,
	);
	await page.getByRole("button", { name: "Send request" }).click();
	await expect(page).toHaveURL(/\/support\/requests\/request-32$/);
});

test("new request accepts only screenshots, recordings, TXT and ZIP with a five-file guard", async ({
	page,
	mockApi,
}, testInfo) => {
	await useUserRole(page);
	await page.goto("/support/new");
	await expect(page.locator("header").getByText("New request", { exact: true })).toBeVisible();
	await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
	const fileInput = page.locator('input[type="file"]');
	await expect(fileInput).toHaveAttribute("accept", /\.zip/);
	await expect(fileInput).not.toHaveAttribute("accept", /7z|tar|gzip/);

	await fileInput.setInputFiles([
		{ name: "one.png", mimeType: "image/png", buffer: Buffer.from("one") },
		{ name: "two.mov", mimeType: "video/quicktime", buffer: Buffer.from("two") },
		{ name: "three.txt", mimeType: "text/plain", buffer: Buffer.from("three") },
		{ name: "four.zip", mimeType: "application/zip", buffer: Buffer.from("four") },
		{ name: "five.webp", mimeType: "image/webp", buffer: Buffer.from("five") },
		{ name: "six.mp4", mimeType: "video/mp4", buffer: Buffer.from("six") },
	]);
	await expect(page.getByRole("alert")).toHaveText("You can attach up to 5 files");
	await expect(page.locator('button[aria-label^="Remove "]')).toHaveCount(5);

	await page.getByLabel("Subject").fill("Connection stopped working");
	const message = page.getByRole("textbox", { name: "What happened?" });
	const formattingToolbar = page.getByRole("toolbar", { name: "Text formatting" });
	await expect(formattingToolbar).toBeVisible();
	await message.fill("The client times out after refreshing the profile");
	await selectEditorContents(message);
	await formattingToolbar.getByRole("button", { name: "Bold" }).click();
	await expect(message.locator("strong")).toHaveText(
		"The client times out after refreshing the profile",
	);
	await page.screenshot({
		path: testInfo.outputPath(`support-new-light-${testInfo.project.name}.png`),
		fullPage: true,
		animations: "disabled",
	});
	const createRequest = page.waitForRequest(
		(request) =>
			request.method() === "POST" && new URL(request.url()).pathname === "/api/support/requests",
	);
	await page.getByRole("button", { name: "Send request" }).click();
	expect((await createRequest).postDataJSON().message).toBe(
		"**The client times out after refreshing the profile**",
	);
	await expect(page).toHaveURL(/\/support\/requests\/request-32$/);
	await expect(page.getByRole("heading", { name: "Connection stopped working" })).toBeVisible();
	expect(mockApi.calls).toContain("POST /api/support/requests");
	expect(mockApi.calls).toContain("POST /api/support/uploads");
	expect(mockApi.calls.filter((call) => call === "PUT /__r2-upload")).toHaveLength(5);
	await assertNoHorizontalOverflow(page);
});

test("text requests stay available when the operator has not configured R2", async ({
	page,
	mockApi,
}) => {
	await useUserRole(page);
	mockApi.mock("GET", "/api/support/capabilities", {
		body: {
			...mockData.supportCapabilities,
			attachmentsEnabled: false,
		},
	});
	await page.goto("/support/new");
	await expect(page.getByRole("button", { name: "Add photos, videos or files" })).toBeDisabled();
	await expect(
		page.getByText("Attachments are unavailable on this server. You can still send a text request"),
	).toBeVisible();
	await page.getByLabel("Subject").fill("Text-only request");
	await page.getByLabel("What happened?").fill("R2 is intentionally not configured.");
	await page.getByRole("button", { name: "Send request" }).click();
	await expect(page).toHaveURL(/\/support\/requests\/request-32$/);
	expect(mockApi.calls).not.toContain("POST /api/support/uploads");
	expect(mockApi.calls).toContain("POST /api/support/requests");
});

test("administrator sees server-owned R2 setup and can check configured access", async ({
	page,
	mockApi,
}, testInfo) => {
	await page.goto("/admin/settings");
	await page.getByRole("button", { name: /Support attachments/ }).click();
	await expect(page).toHaveURL(/\/admin\/settings\/support$/);
	await expect(
		page.locator("header").getByText("Support attachments", { exact: true }),
	).toBeVisible();
	await expect(page.locator('[data-support-storage="configured"]')).toBeVisible();
	await expect(page.getByText("test-support-bucket", { exact: true })).toBeVisible();
	await expect(page.getByText("R2_ACCESS_KEY_ID", { exact: true })).toBeVisible();
	await expect(page.getByRole("heading", { name: "Attachment storage" })).toBeVisible();
	await expect(page.getByRole("heading", { name: "Limits and retention" })).toBeVisible();
	await expect(page.getByRole("heading", { name: "Server configuration" })).toBeVisible();
	await expect(
		page.getByText("Set these values only in the Flowvy server environment", { exact: false }),
	).toBeVisible();
	await expect(page.getByText("Create a private Standard R2 bucket", { exact: false })).toHaveCount(
		0,
	);
	await page.getByRole("button", { name: "Check access" }).click();
	await expect(page.getByText("Available", { exact: true })).toHaveAttribute(
		"data-tone",
		"positive",
	);
	await page.mouse.move(0, 0);
	for (const theme of ["light", "dark"] as const) {
		await page.evaluate(
			(value) => document.documentElement.setAttribute("data-theme", value),
			theme,
		);
		await page.screenshot({
			path: testInfo.outputPath(`support-storage-configured-${theme}-${testInfo.project.name}.png`),
			fullPage: true,
			animations: "disabled",
		});
		const { violations } = await new AxeBuilder({ page }).include("main").analyze();
		expect(violations).toEqual([]);
	}
	expect(mockApi.calls).toContain("POST /api/debug/admin/settings/support-storage/test");
	await assertNoHorizontalOverflow(page);
});

test("Support storage keeps a failed access check in its connection row", async ({
	page,
	mockApi,
}) => {
	mockApi.mock("POST", "/api/debug/admin/settings/support-storage/test", {
		status: 503,
		body: { detail: "Unavailable" },
	});
	await page.goto("/admin/settings/support");
	await page.getByRole("button", { name: "Check access" }).click();
	await expect(page.getByText("Unavailable", { exact: true })).toBeVisible();
	await expect(page.getByRole("button", { name: "Check access" })).toBeEnabled();
});

test("Support storage settings explain the non-configured fallback without exposing inputs", async ({
	page,
	mockApi,
}, testInfo) => {
	mockApi.mock("GET", "/api/debug/admin/settings/support-storage", {
		body: {
			...mockData.supportStorage,
			configured: false,
			attachmentsEnabled: false,
			bucketName: null,
			endpoint: null,
		},
	});
	await page.goto("/admin/settings/support");
	await expect(page.locator('[data-support-storage="missing"]')).toBeVisible();
	await expect(page.getByText("Not configured", { exact: true })).toBeVisible();
	await expect(
		page.getByText("Attachments are disabled. Text requests and replies continue to work"),
	).toBeVisible();
	await expect(page.getByRole("button", { name: "Check access" })).toHaveCount(0);
	await expect(page.locator("input")).toHaveCount(0);
	for (const theme of ["light", "dark"] as const) {
		await page.evaluate(
			(value) => document.documentElement.setAttribute("data-theme", value),
			theme,
		);
		await page.screenshot({
			path: testInfo.outputPath(`support-storage-missing-${theme}-${testInfo.project.name}.png`),
			fullPage: true,
			animations: "disabled",
		});
		const { violations } = await new AxeBuilder({ page }).include("main").analyze();
		expect(violations).toEqual([]);
	}
	await assertNoHorizontalOverflow(page);
});

test("administrator sees the queue, opaque ZIP metadata, reply and resolve controls", async ({
	page,
	mockApi,
}, testInfo) => {
	await page.goto("/support");
	await expect(page.locator('[data-support-view="admin"]')).toBeVisible();
	await expect(page.getByRole("heading", { name: "Needs reply" })).toBeVisible();
	await expect(page.getByRole("heading", { name: "Waiting for user" })).toBeVisible();
	await expect(page.locator('[data-request-status-icon="needs_reply"]')).toHaveAttribute(
		"data-tone",
		"attention",
	);
	await expect(page.locator('[data-status="needs_reply"]')).toHaveAttribute(
		"data-tone",
		"attention",
	);
	await expect(page.locator('[data-request-status-icon="waiting_user"]')).toHaveAttribute(
		"data-tone",
		"neutral",
	);
	const queueSearch = page.getByRole("searchbox", { name: "Search requests or users" });
	await expect(queueSearch).toHaveAttribute("inputmode", "search");
	await expect(queueSearch).toHaveAttribute("enterkeyhint", "search");
	await queueSearch.fill("Maria");
	await queueSearch.press("Enter");
	await expect(queueSearch).not.toBeFocused();

	await page.getByRole("button", { name: /Maria Petrova Connection stopped working/ }).click();
	await expect(page.locator('[data-support-detail="admin"]')).toBeVisible();
	await expect(page.locator("header").getByText("Request", { exact: true })).toBeVisible();
	await expect(page.getByRole("heading", { name: "Request details" })).toBeVisible();
	await expect(page.getByText("Request status", { exact: true })).toBeVisible();
	await expect(page.getByText("Request #31", { exact: true })).toHaveCount(1);
	await expect(page.getByText("client-report.zip", { exact: true })).toBeVisible();
	await expect(page.getByText("ZIP · 4.8 MB · Password protected", { exact: true })).toBeVisible();
	await expect(page.getByRole("button", { name: "Download client-report.zip" })).toBeVisible();
	await expect(page.locator('[data-author="support"][data-owned="true"]')).toHaveCount(1);
	await expect(page.locator('[data-author="user"][data-owned="false"]')).toHaveCount(2);
	await expect(
		page.locator('[data-author="support"] strong').filter({ hasText: "active" }),
	).toHaveText("active");
	for (const theme of ["light", "dark"] as const) {
		await page.evaluate(
			(value) => document.documentElement.setAttribute("data-theme", value),
			theme,
		);
		await page.screenshot({
			path: testInfo.outputPath(`support-detail-${theme}-${testInfo.project.name}.png`),
			fullPage: true,
			animations: "disabled",
		});
		const { violations } = await new AxeBuilder({ page }).include("main").analyze();
		expect(violations).toEqual([]);
	}

	const replyEditor = page.getByRole("textbox", { name: "Reply as Flowvy Support" });
	await replyEditor.scrollIntoViewIfNeeded();
	await page.screenshot({
		path: testInfo.outputPath(`support-detail-composer-dark-${testInfo.project.name}.png`),
		animations: "disabled",
	});
	const replyToolbar = page.getByRole("toolbar", { name: "Text formatting" });
	await expect(replyToolbar).toBeVisible();
	await replyEditor.fill("Please try the refreshed profile once more");
	await selectEditorContents(replyEditor);
	await replyToolbar.getByRole("button", { name: "Bold" }).click();
	const replyRequest = page.waitForRequest(
		(request) =>
			request.method() === "POST" &&
			new URL(request.url()).pathname === "/api/support/requests/request-31/messages",
	);
	await page.getByRole("button", { name: "Send", exact: true }).click();
	expect((await replyRequest).postDataJSON().message).toBe(
		"**Please try the refreshed profile once more**",
	);
	await expect(
		page.getByText("Please try the refreshed profile once more.", { exact: true }),
	).toBeVisible();
	expect(mockApi.calls).toContain("POST /api/support/requests/request-31/messages");

	await page.getByRole("button", { name: "Resolve" }).click();
	await expect(page.getByRole("button", { name: "Reopen" })).toBeVisible();
	await expect(page.getByText("Sending a reply will reopen this request")).toBeVisible();
	await page.getByRole("button", { name: "Reopen" }).click();
	await expect(page.getByRole("button", { name: "Resolve" })).toBeVisible();
	await assertNoHorizontalOverflow(page);
});

test("Support exposes load failure, retry, and empty request states", async ({ page, mockApi }) => {
	await useUserRole(page);
	mockApi.mock("GET", "/api/support/requests", [
		{ status: 503, body: { detail: "Unavailable" } },
		{ status: 503, body: { detail: "Unavailable" } },
		{ body: { requests: [] } },
	]);
	await page.goto("/support");
	await expect(page.getByRole("heading", { name: "Quick Answers" })).toBeVisible();
	await expect(page.getByText("Requests are unavailable right now").first()).toBeVisible();
	await page.getByRole("button", { name: "Retry" }).first().click();
	await expect(page.getByText("No active requests", { exact: true })).toBeVisible();
	await expect(page.getByText("No resolved requests", { exact: true })).toBeVisible();
	await expect(page.getByRole("heading", { name: "Quick Answers" })).toBeVisible();
	await assertNoHorizontalOverflow(page);
});

test("capture user Support overview in light and dark themes", async ({
	page,
	mockApi: _mock,
}, testInfo) => {
	await useUserRole(page);
	for (const theme of ["light", "dark"] as const) {
		await page.goto("/support");
		await page.evaluate(
			(value) => document.documentElement.setAttribute("data-theme", value),
			theme,
		);
		await expect(page.locator('[data-support-view="user"]')).toBeVisible();
		await assertNoHorizontalOverflow(page);
		await page.screenshot({
			path: testInfo.outputPath(`support-user-${theme}-${testInfo.project.name}.png`),
			fullPage: true,
			animations: "disabled",
		});
		const { violations } = await new AxeBuilder({ page }).include("main").analyze();
		expect(violations).toEqual([]);
	}
});

test("capture administrator Support queue in light and dark themes", async ({
	page,
	mockApi: _mock,
}, testInfo) => {
	for (const theme of ["light", "dark"] as const) {
		await page.goto("/support");
		await page.evaluate(
			(value) => document.documentElement.setAttribute("data-theme", value),
			theme,
		);
		await expect(page.locator('[data-support-view="admin"]')).toBeVisible();
		await assertNoHorizontalOverflow(page);
		await page.screenshot({
			path: testInfo.outputPath(`support-admin-${theme}-${testInfo.project.name}.png`),
			fullPage: true,
			animations: "disabled",
		});
		const { violations } = await new AxeBuilder({ page }).include("main").analyze();
		expect(violations).toEqual([]);
	}
});
