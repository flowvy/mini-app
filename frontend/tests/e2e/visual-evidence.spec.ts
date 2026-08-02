import { assertNoHorizontalOverflow, expect, test } from "./fixtures/mock-api.ts";

const screens = [
	{ name: "home", path: "/", marker: "Account Info" },
	{ name: "devices", path: "/devices", marker: "Pixel 8" },
	{ name: "pulse", path: "/pulse", marker: "All systems operational" },
	{ name: "admin-users", path: "/admin/users", marker: "alice" },
	{ name: "admin-user-detail", path: "/admin/users/1", marker: "alice" },
	{ name: "admin-settings", path: "/admin/settings", marker: "Integrations" },
] as const;

test("capture deterministic visual evidence for key screens", async ({
	page,
	mockApi: _mock,
}, testInfo) => {
	for (const screen of screens) {
		await page.goto(screen.path);
		await expect(page.getByText(screen.marker, { exact: true }).first()).toBeVisible();
		await assertNoHorizontalOverflow(page);
		await page.screenshot({
			path: testInfo.outputPath(`${screen.name}.png`),
			animations: "disabled",
		});
	}
});
