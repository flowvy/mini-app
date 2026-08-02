import AxeBuilder from "@axe-core/playwright";
import { assertNoHorizontalOverflow, expect, test } from "./fixtures/mock-api.ts";

test("user routes render deterministic success states", async ({ page, mockApi: _mock }) => {
	await page.goto("/");
	await expect(page.getByText("Account Info")).toBeVisible();
	await expect(page.getByText("Active", { exact: true })).toBeVisible();
	await assertNoHorizontalOverflow(page);

	await page.goto("/devices");
	await expect(page.getByText("Pixel 8")).toBeVisible();
	await assertNoHorizontalOverflow(page);

	await page.goto("/pulse");
	await expect(page.getByText("All systems operational")).toBeVisible();
	await expect(page.getByText("VPN API")).toBeVisible();
	await assertNoHorizontalOverflow(page);

	await page.goto("/support");
	await expect(page.getByText("Coming soon")).toBeVisible();
});

test("admin routes render deterministic success and placeholder states", async ({
	page,
	mockApi: _mock,
}) => {
	await page.goto("/admin/dashboard");
	await expect(page.getByText("Remnawave unavailable")).toBeVisible();

	await page.goto("/admin/users");
	await expect(page.getByRole("textbox", { name: "Search users" })).toBeVisible();
	await expect(page.getByText("alice")).toBeVisible();

	await page.goto("/admin/settings");
	await expect(page.getByText("Integrations")).toBeVisible();
	await expect(page.getByText("Remnawave")).toBeVisible();

	await page.goto("/admin/broadcast");
	await expect(page.getByText("Coming soon")).toBeVisible();
	await assertNoHorizontalOverflow(page);
});

test("stable support screen has no serious automated accessibility violations", async ({
	page,
	mockApi: _mock,
}) => {
	await page.goto("/support");
	await expect(page.getByText("Coming soon")).toBeVisible();

	const result = await new AxeBuilder({ page }).analyze();
	const serious = result.violations.filter((violation) =>
		["serious", "critical"].includes(violation.impact ?? ""),
	);
	expect(serious).toEqual([]);
});
