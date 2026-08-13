import type { Locator } from "@playwright/test";
import { expect, test } from "./fixtures/mock-api.ts";

async function selectedLayerOffset(locator: Locator): Promise<number> {
	return locator.evaluate((element) =>
		Number.parseFloat(getComputedStyle(element, "::before").insetInlineStart),
	);
}

async function selectedLayerDurationMs(locator: Locator): Promise<number> {
	return locator.evaluate((element) => {
		const firstDuration = getComputedStyle(element, "::before").transitionDuration.split(",")[0];
		return Number.parseFloat(firstDuration) * 1000;
	});
}

test("segmented selection surface slides between related views", async ({
	page,
	mockApi: _mock,
}) => {
	await page.emulateMedia({ reducedMotion: "no-preference" });
	await page.goto("/admin/dashboard");
	const dashboardView = page.getByRole("tablist", { name: "Dashboard view" });
	const remnawave = dashboardView.getByRole("tab", { name: "Remnawave" });
	const flowvy = dashboardView.getByRole("tab", { name: "Flowvy Mini-App" });
	const initialOffset = await selectedLayerOffset(dashboardView);
	expect(await selectedLayerDurationMs(dashboardView)).toBeLessThanOrEqual(200);
	await expect(remnawave).toHaveAttribute("aria-selected", "true");
	await flowvy.click();
	await expect(flowvy).toHaveAttribute("aria-selected", "true");
	await expect(page.getByRole("tabpanel", { name: "Flowvy Mini-App" })).toBeVisible();
	await expect.poll(() => selectedLayerOffset(dashboardView)).toBeGreaterThan(initialOffset + 50);
	await flowvy.press("ArrowLeft");
	await expect(remnawave).toBeFocused();
	await expect(remnawave).toHaveAttribute("aria-selected", "true");
});

test("selection motion follows the system Reduce Motion preference", async ({
	page,
	mockApi: _mock,
}) => {
	await page.emulateMedia({ reducedMotion: "reduce" });
	await page.goto("/admin/dashboard");
	const dashboardView = page.getByRole("tablist", { name: "Dashboard view" });
	expect(await selectedLayerDurationMs(dashboardView)).toBeLessThan(1);
});

test("form controls avoid the iOS focus-zoom threshold without disabling user zoom", async ({
	page,
	mockApi: _mock,
}) => {
	await page.goto("/admin/settings/beszel");
	const urlInput = page.getByPlaceholder("https://monitor.example.com");
	const { fontSize, touchInput } = await urlInput.evaluate((element) => ({
		fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
		touchInput: window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0,
	}));
	if (touchInput) {
		expect(fontSize).toBeGreaterThanOrEqual(16);
	} else {
		expect(fontSize).toBeLessThan(16);
	}
	const viewport = await page.locator('meta[name="viewport"]').getAttribute("content");
	expect(viewport).not.toContain("user-scalable=no");
	expect(viewport).not.toContain("maximum-scale=1");
});

test("access controls keep Flowvy typography with compact placeholders", async ({
	page,
	mockApi: _mock,
}) => {
	await page.goto("/admin/settings/access");
	const defaultAccess = page.getByLabel("Default access");
	const defaultAccessValue = defaultAccess.locator("..").locator("span", {
		hasText: "No proxy access",
	});
	await expect(defaultAccessValue).toHaveCSS("font-family", /Geist/);
	await expect(defaultAccessValue).toHaveCSS("font-size", "13px");
	await defaultAccess.focus();
	const defaultAccessFocus = await defaultAccess.locator("..").evaluate((element) => ({
		boxShadow: getComputedStyle(element).boxShadow,
		finePointer: window.matchMedia("(hover: hover) and (pointer: fine)").matches,
	}));
	if (defaultAccessFocus.finePointer) {
		expect(defaultAccessFocus.boxShadow).not.toBe("none");
	} else {
		expect(defaultAccessFocus.boxShadow).toBe("none");
	}

	await page.getByRole("button", { name: "Create profile" }).click();
	const name = page.getByPlaceholder("Free 30 days");
	const typography = await name.evaluate((element) => ({
		controlSize: Number.parseFloat(getComputedStyle(element).fontSize),
		controlFamily: getComputedStyle(element).fontFamily,
		placeholderSize: Number.parseFloat(getComputedStyle(element, "::placeholder").fontSize),
		placeholderFamily: getComputedStyle(element, "::placeholder").fontFamily,
	}));
	const touchInput = await page.evaluate(
		() => window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0,
	);
	if (touchInput) {
		expect(typography.controlSize).toBeGreaterThanOrEqual(16);
	} else {
		expect(typography.controlSize).toBe(13);
	}
	expect(typography.controlFamily).toContain("Geist");
	expect(typography.placeholderSize).toBe(13);
	expect(typography.placeholderFamily).toContain("Geist");

	const days = page.getByLabel("Number of days");
	const daysRestingValue = days.locator("..").getByText("30", { exact: true });
	if (touchInput) {
		await expect(daysRestingValue).toBeVisible();
		await expect(daysRestingValue).toHaveCSS("font-family", /Geist/);
		await expect(daysRestingValue).toHaveCSS("font-size", "13px");
		await days.focus();
		await expect(daysRestingValue).not.toBeVisible();
		await days.blur();
		await expect(daysRestingValue).toBeVisible();
	} else {
		await expect(daysRestingValue).not.toBeVisible();
		await expect(days).toHaveCSS("font-size", "13px");
	}

	await page.getByRole("radio", { name: "Date" }).click();
	await expect(page.getByText("Every new user receives access until this date.")).toHaveCount(0);
	const date = page.getByRole("textbox", { name: "Expires at" });
	const dateRow = page.getByRole("group", { name: "Expires at" });
	await date.fill("2026-09-01");
	const dateValue = date.locator("..").getByText("Sep 1, 2026", { exact: true });
	await expect(dateValue).toHaveCSS("font-family", /Geist/);
	await expect(dateValue).toHaveCSS("font-size", "13px");
	const editor = page.getByRole("dialog", { name: "Create access profile" });
	const expiresLabel = page.getByText("Expires at", { exact: true });
	const [editorBox, rowBox, labelBox, dateBox] = await Promise.all([
		editor.boundingBox(),
		dateRow.boundingBox(),
		expiresLabel.boundingBox(),
		date.boundingBox(),
	]);
	expect(editorBox).not.toBeNull();
	expect(rowBox).not.toBeNull();
	expect(labelBox).not.toBeNull();
	expect(dateBox).not.toBeNull();
	const dateRowStyle = await dateRow.evaluate((element) => {
		const style = getComputedStyle(element);
		return {
			backgroundColor: style.backgroundColor,
			borderTopStyle: style.borderTopStyle,
			borderTopWidth: style.borderTopWidth,
		};
	});
	expect(dateRowStyle.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
	expect(dateRowStyle.borderTopStyle).not.toBe("none");
	expect(dateRowStyle.borderTopWidth).toBe("1px");
	expect(rowBox?.width ?? 0).toBeGreaterThan((editorBox?.width ?? 0) * 0.8);
	expect((dateBox?.x ?? 0) + (dateBox?.width ?? 0)).toBeLessThanOrEqual(
		(editorBox?.x ?? 0) + (editorBox?.width ?? 0),
	);
	expect(
		Math.abs(
			(labelBox?.y ?? 0) +
				(labelBox?.height ?? 0) / 2 -
				((dateBox?.y ?? 0) + (dateBox?.height ?? 0) / 2),
		),
	).toBeLessThan(2);
	await date.fill("2026-09-15");
	await expect(date.locator("..").getByText("Sep 15, 2026", { exact: true })).toBeVisible();
	await page.getByText("Advanced Remnawave fields").focus();
	await page.keyboard.press("Enter");
	const initialStatus = page.getByLabel("Initial status");
	await expect(initialStatus.locator("..").locator("span", { hasText: "ACTIVE" })).toHaveCSS(
		"font-family",
		/Geist/,
	);
});
