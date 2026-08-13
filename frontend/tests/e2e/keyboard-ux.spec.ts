import { expect, test } from "./fixtures/mock-api.ts";

test("Enter dismisses every single-line editor and preserves multiline input", async ({
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

	for (const path of [
		"/admin/users",
		"/admin/settings/kuma",
		"/admin/settings/beszel",
		"/admin/settings/branding",
		"/admin/settings/welcome",
	] as const) {
		await page.goto(path);
		const inputs = page.locator('input:not([type="file"])');
		await expect(inputs.first()).toBeVisible();
		const count = await inputs.count();
		await page.evaluate(() => {
			(window as typeof window & { __hideKeyboardCalls?: number }).__hideKeyboardCalls = 0;
		});
		for (let index = 0; index < count; index++) {
			const input = inputs.nth(index);
			await input.focus();
			await expect(input).toBeFocused();
			await input.press("Enter");
			await expect(input).not.toBeFocused();
		}
		await expect
			.poll(() =>
				page.evaluate(
					() => (window as typeof window & { __hideKeyboardCalls?: number }).__hideKeyboardCalls,
				),
			)
			.toBe(count);
	}

	await page.goto("/admin/settings/access");
	await page.getByRole("button", { name: "Create profile" }).click();
	const accessInputs = page.locator('input:not([type="file"]):not([type="checkbox"])');
	const accessInputCount = await accessInputs.count();
	for (const input of await accessInputs.all()) {
		await input.focus();
		await expect(input).toBeFocused();
		await input.press("Enter");
		await expect(input).not.toBeFocused();
	}
	await expect
		.poll(() =>
			page.evaluate(
				() => (window as typeof window & { __hideKeyboardCalls?: number }).__hideKeyboardCalls,
			),
		)
		.toBe(accessInputCount);

	await page.goto("/admin/settings/welcome");
	await page.evaluate(() => {
		(window as typeof window & { __hideKeyboardCalls?: number }).__hideKeyboardCalls = 0;
	});
	const textarea = page.locator("textarea");
	await textarea.fill("First line");
	await textarea.press("Enter");
	await expect(textarea).toBeFocused();
	await expect(textarea).toHaveValue("First line\n");
	await expect
		.poll(() =>
			page.evaluate(
				() => (window as typeof window & { __hideKeyboardCalls?: number }).__hideKeyboardCalls,
			),
		)
		.toBe(0);
});

test("mobile form focus hides bottom chrome until editing finishes", async ({
	page,
	mockApi: _mock,
}) => {
	await page.goto("/admin/settings/access");
	await page.getByRole("button", { name: "Create profile" }).click();
	const navigation = page.getByRole("navigation", { includeHidden: true });
	const touchInput = await page.evaluate(
		() => window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0,
	);

	const name = page.getByLabel("Name");
	await name.focus();
	if (touchInput) {
		await expect(navigation).toHaveAttribute("aria-hidden", "true");
		await expect(navigation).toHaveCSS("pointer-events", "none");
	} else {
		await expect(navigation).not.toHaveAttribute("aria-hidden", "true");
	}

	await name.press("Enter");
	await expect(name).not.toBeFocused();
	await expect(navigation).not.toHaveAttribute("aria-hidden", "true");

	await page.getByText("Advanced Remnawave fields").focus();
	await page.keyboard.press("Enter");
	const description = page.getByLabel("Description");
	await description.focus();
	await description.press("Enter");
	await expect(description).toBeFocused();
	if (touchInput) await expect(navigation).toHaveAttribute("aria-hidden", "true");
	await description.blur();
	await expect(navigation).not.toHaveAttribute("aria-hidden", "true");

	const status = page.getByLabel("Initial status");
	await status.focus();
	await expect(navigation).not.toHaveAttribute("aria-hidden", "true");
	await status.selectOption("DISABLED");
	await status.blur();
	await expect(navigation).not.toHaveAttribute("aria-hidden", "true");

	await page.getByRole("radio", { name: "Date" }).click();
	const date = page.getByRole("textbox", { name: "Expires at" });
	await date.focus();
	await expect(navigation).not.toHaveAttribute("aria-hidden", "true");
	await date.fill("2026-09-01");
	await date.blur();
	await expect(navigation).not.toHaveAttribute("aria-hidden", "true");
});
