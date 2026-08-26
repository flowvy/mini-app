import AxeBuilder from "@axe-core/playwright";
import type { Page, TestInfo } from "@playwright/test";
import { assertNoHorizontalOverflow, expect, mockData, test } from "./fixtures/mock-api.ts";

async function labelTop(page: Page, selector: string): Promise<number> {
	return page.locator(selector).evaluate((element) => element.getBoundingClientRect().top);
}

async function verifyThemeEvidence(page: Page, testInfo: TestInfo, name: string): Promise<void> {
	for (const colorScheme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
		await page.evaluate((theme) => {
			document.documentElement.setAttribute("data-theme", theme);
		}, colorScheme);
		await expect(page.locator("body")).toHaveCSS(
			"color",
			colorScheme === "dark" ? "rgb(255, 255, 255)" : "rgb(23, 23, 23)",
		);
		const screenshot = await page.screenshot({ fullPage: true, animations: "disabled" });
		await testInfo.attach(`${name}-${colorScheme}`, { body: screenshot, contentType: "image/png" });
		const accessibility = await new AxeBuilder({ page }).analyze();
		const serious = accessibility.violations.filter((violation) =>
			["serious", "critical"].includes(violation.impact ?? ""),
		);
		expect(serious, `${name} ${colorScheme}`).toEqual([]);
	}
}

test("dynamic content keeps its assigned layout slots", async ({ page, mockApi }, testInfo) => {
	await page.addInitScript(() => {
		Object.defineProperty(navigator, "languages", { configurable: true, value: ["ru-RU", "ru"] });
		Object.defineProperty(navigator, "language", { configurable: true, value: "ru-RU" });
	});
	mockApi.mock("GET", "/api/me/subscription", {
		body: {
			...mockData.subscription,
			name: `tg_${"9".repeat(80)}`,
			expiresAt: 4_102_444_800,
			deviceLimit: 1,
		},
	});

	await page.goto("/");
	await expect(page.locator('[data-ui="home-expiry-unlimited"]')).toBeVisible();
	await expect(page.locator('[data-ui="home-expiry-label"]')).toHaveText("Истекает");
	await expect(page.locator('[data-ui="home-devices-label"]')).toHaveText("Устройства");
	const [expiryTop, devicesTop] = await Promise.all([
		labelTop(page, '[data-ui="home-expiry-label"]'),
		labelTop(page, '[data-ui="home-devices-label"]'),
	]);
	expect(expiryTop).toBeCloseTo(devicesTop, 1);
	const resetLabel = page.getByText("Ежемесячно", { exact: true });
	const resetLabelMetrics = await resetLabel.evaluate((element) => ({
		height: element.getBoundingClientRect().height,
		lineHeight: Number.parseFloat(getComputedStyle(element).lineHeight),
	}));
	expect(resetLabelMetrics.height).toBeLessThanOrEqual(resetLabelMetrics.lineHeight * 1.1);
	await assertNoHorizontalOverflow(page);

	const contract = await page.evaluate(() => {
		const probe = document.createElement("div");
		probe.style.cssText = "display:grid;grid-template-columns:1fr;width:120px;position:absolute";
		const value = document.createElement("span");
		value.textContent = "content-without-break-opportunities-".repeat(8);
		probe.append(value);
		document.getElementById("root")?.append(probe);
		const result = {
			probeWidth: probe.getBoundingClientRect().width,
			valueWidth: value.getBoundingClientRect().width,
			valueHeight: value.getBoundingClientRect().height,
			lineHeight: Number.parseFloat(getComputedStyle(value).lineHeight),
		};
		probe.remove();
		return result;
	});
	expect(contract.valueWidth).toBeLessThanOrEqual(contract.probeWidth);
	expect(contract.valueHeight).toBeGreaterThan(contract.lineHeight);

	await verifyThemeEvidence(page, testInfo, "home-content-layout");
});

test("application text follows the global wrapping policy", async ({
	page,
	mockApi: _mock,
}, testInfo) => {
	await page.addInitScript(() => localStorage.setItem("flowvy:mock-role", "user"));
	await page.goto("/support");
	const heading = page.getByRole("heading", { name: "Quick Answers" });
	const paragraph = page.getByText("Send a request and keep the whole conversation here", {
		exact: true,
	});
	await expect(heading).toBeVisible();
	await expect(paragraph).toBeVisible();

	const wrapping = await page.evaluate(() => {
		const root = document.getElementById("root");
		const heading = document.querySelector("main h2");
		const paragraph = Array.from(document.querySelectorAll("main p")).find((element) =>
			element.textContent?.includes("whole conversation"),
		);
		if (!root || !heading || !paragraph) throw new Error("Typography probes are missing");

		const editor = document.createElement("div");
		editor.contentEditable = "true";
		editor.textContent = "Editable wrapping probe";
		root.append(editor);
		const result = {
			supported: CSS.supports("text-wrap-style", "pretty"),
			root: getComputedStyle(root).getPropertyValue("text-wrap-style"),
			heading: getComputedStyle(heading).getPropertyValue("text-wrap-style"),
			paragraph: getComputedStyle(paragraph).getPropertyValue("text-wrap-style"),
			editor: getComputedStyle(editor).getPropertyValue("text-wrap-style"),
		};
		editor.remove();
		return result;
	});

	expect(wrapping).toEqual({
		supported: true,
		root: "pretty",
		heading: "balance",
		paragraph: "pretty",
		editor: "stable",
	});
	await assertNoHorizontalOverflow(page);
	for (const theme of ["light", "dark"] as const) {
		await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
		await page.evaluate(
			(value) => document.documentElement.setAttribute("data-theme", value),
			theme,
		);
		await page.locator("main").screenshot({
			path: testInfo.outputPath(`global-text-wrapping-${theme}-${testInfo.project.name}.png`),
			animations: "disabled",
		});
		const { violations } = await new AxeBuilder({ page }).include("main").analyze();
		expect(violations).toEqual([]);
	}
});

test("admin mixed icon and numeric metrics share one label row", async ({
	page,
	mockApi,
}, testInfo) => {
	mockApi.mock("GET", "/api/debug/admin/users/1", {
		body: { ...mockData.adminUser, expireAt: null, hwidDeviceLimit: 1 },
	});
	await page.goto("/admin/users/1");
	await expect(page.locator('[data-ui="admin-expiry-label"]')).toBeVisible();
	const [expiryTop, devicesTop] = await Promise.all([
		labelTop(page, '[data-ui="admin-expiry-label"]'),
		labelTop(page, '[data-ui="admin-devices-label"]'),
	]);
	expect(expiryTop).toBeCloseTo(devicesTop, 1);
	await assertNoHorizontalOverflow(page);
	await verifyThemeEvidence(page, testInfo, "admin-content-layout");
});
