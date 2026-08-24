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
	const body = page.getByRole("textbox", { name: "Article" });
	await body.focus();
	await body.pressSequentially(
		"Restart Flowvy Desktop, then reconnect. Never share an access key.",
	);
	await expect(page.getByRole("button", { name: "Save draft" })).toBeEnabled();
	await status.selectOption("published");
	await expect(page.getByRole("button", { name: "Publish" })).toBeEnabled();
	await page.getByRole("button", { name: "Publish" }).click();
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
					{ id: "cancel", text: "Cancel" },
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
			{ id: "cancel", text: "Cancel" },
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
	await message.press("ControlOrMeta+A");
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
	await expect(page.getByText("flowvy-support", { exact: true })).toBeVisible();
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
	await replyEditor.press("ControlOrMeta+A");
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
