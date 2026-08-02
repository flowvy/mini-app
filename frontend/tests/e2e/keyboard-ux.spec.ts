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

	let singleLineInputs = 0;
	for (const path of [
		"/admin/users",
		"/admin/settings/kuma",
		"/admin/settings/beszel",
		"/admin/settings/branding",
		"/admin/settings/welcome",
	] as const) {
		await page.goto(path);
		const inputs = page.locator('input:not([type="file"])');
		const count = await inputs.count();
		for (let index = 0; index < count; index++) {
			const input = inputs.nth(index);
			await input.focus();
			await expect(input).toBeFocused();
			await input.press("Enter");
			await expect(input).not.toBeFocused();
			singleLineInputs++;
		}
	}

	await expect
		.poll(() =>
			page.evaluate(
				() => (window as typeof window & { __hideKeyboardCalls?: number }).__hideKeyboardCalls,
			),
		)
		.toBe(singleLineInputs);

	await page.goto("/admin/settings/welcome");
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
		.toBe(singleLineInputs);
});
