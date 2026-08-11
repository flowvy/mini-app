import AxeBuilder from "@axe-core/playwright";
import { assertNoHorizontalOverflow, expect, test } from "./fixtures/mock-api.ts";

test("user routes render deterministic success states", async ({ page, mockApi: _mock }) => {
	await page.goto("/");
	await expect(page.getByText("Account Info")).toBeVisible();
	await expect(page.getByText("Active", { exact: true })).toBeVisible();
	await expect(page.getByText("Invite friends")).toBeVisible();
	await assertNoHorizontalOverflow(page);

	await page.goto("/devices");
	await expect(page.getByText("Pixel 8")).toBeVisible();
	await assertNoHorizontalOverflow(page);

	await page.goto("/pulse");
	await expect(page.getByText("All systems operational")).toBeVisible();
	await expect(page.getByText("Proxy API")).toBeVisible();
	await assertNoHorizontalOverflow(page);

	await page.goto("/support");
	await expect(page.getByRole("heading", { name: "Support" })).toBeVisible();
	await expect(page.getByText("In-app support is coming soon.")).toBeVisible();
	await assertNoHorizontalOverflow(page);
});

test("admin routes render deterministic success and placeholder states", async ({
	page,
	mockApi: _mock,
}) => {
	await page.goto("/admin/dashboard");
	await expect(page.getByRole("button", { name: "Remnawave" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Flowvy Mini-App" })).toBeVisible();
	await expect(page.getByText("Remnawave unavailable")).toBeVisible();

	await page.goto("/admin/users");
	await expect(page.getByRole("textbox", { name: "Search users" })).toBeVisible();
	await expect(page.getByText("alice")).toBeVisible();
	await page.goto("/admin/users/1");
	await expect(page.getByText("alice", { exact: true })).toBeVisible();
	await expect(page.getByRole("button", { name: "Back" })).toHaveCount(0);
	await expect(page.getByText("Invitations", { exact: true })).toBeVisible();
	await expect(page.getByText("Registered users")).toBeVisible();
	await expect(page.getByText("3", { exact: true })).toBeVisible();

	await page.goto("/admin/settings");
	await expect(page.getByText("Integrations")).toBeVisible();
	await expect(page.getByText("Remnawave", { exact: true })).toBeVisible();
	await expect(page.getByText("Registration & Access")).toBeVisible();
	const miniAppCard = page
		.getByText("Flowvy Mini-App", { exact: true })
		.locator("xpath=following-sibling::*[1]");
	await expect(miniAppCard.getByText("Identity", { exact: true })).toBeVisible();
	await expect(miniAppCard.getByText("Registration & Access", { exact: true })).toBeVisible();
	await expect(page.getByText("Branding", { exact: true })).not.toBeVisible();

	await page.goto("/admin/settings/access");
	await expect(page.getByText("Service mode")).toBeVisible();
	await expect(page.getByRole("button", { name: "Back" })).toHaveCount(0);

	await page.goto("/admin/settings/beszel");
	await expect(page.getByText("Hub URL", { exact: true })).toBeVisible();
	await expect(page.getByText("Configured on server")).toBeVisible();
	await expect(page.getByRole("button", { name: "Back" })).toHaveCount(0);

	await page.goto("/admin/broadcast");
	await expect(page.getByText("Coming soon")).toBeVisible();
	await assertNoHorizontalOverflow(page);
});

test("detail screens rely on Telegram Back instead of duplicate in-content headers", async ({
	page,
	mockApi: _mock,
}) => {
	const detailScreens = [
		{ path: "/admin/settings/kuma", marker: "URL" },
		{ path: "/admin/settings/beszel", marker: "Hub URL" },
		{ path: "/admin/settings/branding", marker: "App Name" },
		{ path: "/admin/settings/welcome", marker: "Message" },
		{ path: "/admin/settings/access", marker: "Service mode" },
		{ path: "/admin/users/1", marker: "alice" },
	] as const;

	for (const screen of detailScreens) {
		await page.goto(screen.path);
		await expect(page.getByText(screen.marker, { exact: true }).first()).toBeVisible();
		await expect(page.getByRole("button", { name: "Back" })).toHaveCount(0);
	}
});

test("stable support screen has no serious automated accessibility violations", async ({
	page,
	mockApi: _mock,
}) => {
	await page.goto("/support");
	await expect(page.getByRole("heading", { name: "Support" })).toBeVisible();

	const result = await new AxeBuilder({ page }).analyze();
	const serious = result.violations.filter((violation) =>
		["serious", "critical"].includes(violation.impact ?? ""),
	);
	expect(serious).toEqual([]);
});
