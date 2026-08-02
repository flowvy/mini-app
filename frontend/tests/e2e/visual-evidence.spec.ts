import { assertNoHorizontalOverflow, expect, test } from "./fixtures/mock-api.ts";

const screens = [
	{ name: "home", path: "/", marker: "Account Info" },
	{ name: "devices", path: "/devices", marker: "Pixel 8" },
	{ name: "pulse", path: "/pulse", marker: "All systems operational" },
	{ name: "admin-users", path: "/admin/users", marker: "alice" },
	{ name: "admin-user-detail", path: "/admin/users/1", marker: "alice" },
	{ name: "admin-settings", path: "/admin/settings", marker: "Integrations" },
	{ name: "admin-settings-beszel", path: "/admin/settings/beszel", marker: "Beszel" },
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

test("capture Beszel settings in light and dark themes", async ({
	page,
	mockApi: _mock,
}, testInfo) => {
	for (const colorScheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
		await page.goto("/admin/settings/beszel");
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		await expect(page.getByRole("heading", { name: "Beszel" })).toBeVisible();
		await assertNoHorizontalOverflow(page);
		await page.screenshot({
			path: testInfo.outputPath(`admin-settings-beszel-${colorScheme}.png`),
			animations: "disabled",
		});
	}
});
