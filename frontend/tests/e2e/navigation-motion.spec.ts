import AxeBuilder from "@axe-core/playwright";
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

test("route changes preserve full color opacity without reveal animation", async ({
	page,
	mockApi: _mock,
}) => {
	await page.emulateMedia({ colorScheme: "dark", reducedMotion: "no-preference" });
	await page.goto("/admin/dashboard");
	await page.evaluate(() => {
		const eventLog: string[] = [];
		const recordRouteMotion = (event: Event) => {
			if (event.target instanceof Element && event.target.parentElement?.tagName === "MAIN") {
				eventLog.push(event.type);
			}
		};
		document.addEventListener("animationstart", recordRouteMotion, true);
		document.addEventListener("transitionrun", recordRouteMotion, true);
		(
			window as Window & {
				__flowvyRouteMotionEvents?: string[];
			}
		).__flowvyRouteMotionEvents = eventLog;
	});
	await page.getByRole("link", { name: "Broadcast" }).click();
	await expect(page.getByRole("heading", { name: "Broadcast" })).toBeVisible();
	const routeView = page.getByRole("main").locator(":scope > div");
	await expect(routeView).toHaveCSS("opacity", "1");
	await expect(routeView).toHaveCSS("transform", "none");
	await expect(routeView).toHaveCSS("animation-name", "none");
	await expect(routeView).toHaveCSS("animation-duration", "0s");
	await expect(routeView).toHaveCSS("transition-duration", "0s");
	expect(
		await page.evaluate(
			() =>
				(
					window as Window & {
						__flowvyRouteMotionEvents?: string[];
					}
				).__flowvyRouteMotionEvents ?? [],
		),
	).toEqual([]);
	expect((await new AxeBuilder({ page }).include("main").analyze()).violations).toEqual([]);
});

test("form controls use the global type scale with focus zoom constrained", async ({
	page,
	mockApi: _mock,
}) => {
	await page.goto("/admin/settings/beszel");
	const urlInput = page.getByPlaceholder("https://monitor.example.com");
	const standaloneSurface = await page.evaluate(() => {
		const probe = document.createElement("span");
		probe.style.background = "var(--v2-bg-primary)";
		probe.style.border =
			"1px solid color-mix(in srgb, var(--v2-border-secondary) 60%, transparent)";
		document.body.append(probe);
		const style = getComputedStyle(probe);
		const colors = {
			background: style.backgroundColor,
			border: style.borderColor,
		};
		probe.remove();
		return colors;
	});
	await expect(urlInput).toHaveCSS("background-color", standaloneSurface.background);
	await expect(urlInput).toHaveCSS("border-color", standaloneSurface.border);
	await expect(urlInput).toHaveCSS("box-shadow", "none");
	await expect(urlInput).toHaveCSS("outline-style", "none");
	await expect(urlInput).toHaveCSS("font-size", "13px");
	expect(
		await urlInput.evaluate((element) => getComputedStyle(element, "::placeholder").fontSize),
	).toBe("13px");
	const viewport = await page.locator('meta[name="viewport"]').getAttribute("content");
	expect(viewport).not.toContain("user-scalable=no");
	expect(viewport).toContain("maximum-scale=1");
});

test("access controls keep Flowvy typography with native input values", async ({
	page,
	mockApi: _mock,
}) => {
	await page.goto("/admin/settings/access");
	const defaultAccess = page.getByLabel("Default access");
	const defaultAccessValue = defaultAccess.locator("..").locator("span", {
		hasText: "No proxy access",
	});
	const standaloneSurface = await page.evaluate(() => {
		const probe = document.createElement("span");
		probe.style.background = "var(--v2-bg-primary)";
		probe.style.border =
			"1px solid color-mix(in srgb, var(--v2-border-secondary) 60%, transparent)";
		document.body.append(probe);
		const style = getComputedStyle(probe);
		const colors = {
			background: style.backgroundColor,
			border: style.borderColor,
		};
		probe.remove();
		return colors;
	});
	await expect(defaultAccessValue).toHaveCSS("font-family", /Geist/);
	await expect(defaultAccessValue).toHaveCSS("font-size", "13px");
	const defaultAccessShell = defaultAccess.locator("..");
	await expect(defaultAccessShell).toHaveCSS("background-color", standaloneSurface.background);
	await expect(defaultAccessShell).toHaveCSS("border-color", standaloneSurface.border);
	await expect(defaultAccessShell).toHaveCSS("box-shadow", "none");
	await defaultAccess.focus();
	const positiveBorder = await page.evaluate(() => {
		const probe = document.createElement("span");
		probe.style.color = "var(--v2-border-positive-secondary)";
		document.body.append(probe);
		const color = getComputedStyle(probe).color;
		probe.remove();
		return color;
	});
	await expect(defaultAccessShell).toHaveCSS("box-shadow", "none");
	await expect(defaultAccessShell).toHaveCSS("border-color", positiveBorder);

	await page.getByRole("button", { name: "Create profile" }).click();
	const name = page.getByPlaceholder("Free 30 days");
	const typography = await name.evaluate((element) => ({
		controlSize: Number.parseFloat(getComputedStyle(element).fontSize),
		controlFamily: getComputedStyle(element).fontFamily,
		placeholderSize: Number.parseFloat(getComputedStyle(element, "::placeholder").fontSize),
		placeholderFamily: getComputedStyle(element, "::placeholder").fontFamily,
	}));
	expect(typography.controlSize).toBe(13);
	expect(typography.controlFamily).toContain("Geist");
	expect(typography.placeholderSize).toBe(typography.controlSize);
	expect(typography.placeholderFamily).toContain("Geist");

	const days = page.getByLabel("Number of days");
	await expect(days).toHaveCSS("font-size", "13px");
	await expect(days).toHaveCSS("font-family", /Geist/);
	await expect(days).toHaveValue("30");

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
			borderColor: style.borderTopColor,
			borderTopStyle: style.borderTopStyle,
			borderTopWidth: style.borderTopWidth,
		};
	});
	const nestedSurface = await page.evaluate(() => {
		const probe = document.createElement("span");
		probe.style.background = "var(--v2-bg-secondary)";
		probe.style.border = "1px solid var(--v2-border-tertiary)";
		document.body.append(probe);
		const style = getComputedStyle(probe);
		const colors = {
			background: style.backgroundColor,
			border: style.borderColor,
		};
		probe.remove();
		return colors;
	});
	expect(dateRowStyle.backgroundColor).toBe(nestedSurface.background);
	expect(dateRowStyle.borderColor).toBe(positiveBorder);
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
