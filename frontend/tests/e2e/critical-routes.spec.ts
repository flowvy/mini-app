import AxeBuilder from "@axe-core/playwright";
import type { Locator } from "@playwright/test";
import { assertNoHorizontalOverflow, expect, test } from "./fixtures/mock-api.ts";

const SECTION_GAP = 8;

async function expectDirectSectionGap(heading: Locator): Promise<void> {
	const gap = await heading.evaluate((element) => {
		const previous = element.previousElementSibling;
		if (previous) {
			const paddingTop = Number.parseFloat(getComputedStyle(element).paddingTop);
			return (
				element.getBoundingClientRect().top + paddingTop - previous.getBoundingClientRect().bottom
			);
		}
		const section = element.closest("section");
		const previousSection = section?.previousElementSibling;
		if (!section || !previousSection) throw new Error("Section heading has no preceding content");
		return section.getBoundingClientRect().top - previousSection.getBoundingClientRect().bottom;
	});
	expect(gap).toBeCloseTo(SECTION_GAP, 1);
}

async function expectAttachedSection(heading: Locator): Promise<void> {
	const geometry = await heading.evaluate((element) => {
		const section = element.closest("section");
		const header = element.parentElement;
		const card = header?.nextElementSibling;
		if (!section || !header || !card) throw new Error("Attached section structure is incomplete");
		return {
			gap: card.getBoundingClientRect().top - header.getBoundingClientRect().bottom,
			headerTopRadius: getComputedStyle(header).borderTopLeftRadius,
			headerBottomRadius: getComputedStyle(header).borderBottomLeftRadius,
			cardTopRadius: getComputedStyle(card).borderTopLeftRadius,
			cardBottomRadius: getComputedStyle(card).borderBottomLeftRadius,
		};
	});
	expect(geometry.gap).toBeCloseTo(0, 1);
	expect(geometry.headerTopRadius).not.toBe("0px");
	expect(geometry.headerBottomRadius).toBe("0px");
	expect(geometry.cardTopRadius).toBe("0px");
	expect(geometry.cardBottomRadius).not.toBe("0px");
}

test("user routes render deterministic success states", async ({ page, mockApi: _mock }) => {
	await page.goto("/");
	await expect(page.getByText("Account Info")).toBeVisible();
	await expect(page.getByText("Active", { exact: true })).toBeVisible();
	await expect(page.getByText("Invite friends")).toBeVisible();
	await assertNoHorizontalOverflow(page);

	await page.goto("/devices");
	await expect(page.getByText("Pixel 8", { exact: true })).toBeVisible();
	await expect(page.getByRole("img", { name: "Android" })).toBeVisible();
	await expect(page.getByText("Android", { exact: true }).last()).toBeVisible();
	await expect(page.getByText("Aug 1, 2026", { exact: true })).toBeVisible();
	await expect(page.getByText("Aug 2, 2026", { exact: true })).toBeVisible();
	await expect(page.getByText("Happ/3.11.1 (Android; Pixel 8)", { exact: true })).toHaveCount(0);
	await expect(page.getByText("192.0.2.42", { exact: true })).toBeVisible();
	await expect(page.getByText("15", { exact: true })).toHaveCount(0);
	await assertNoHorizontalOverflow(page);

	await page.goto("/pulse");
	await expect(page.getByText("All systems operational")).toBeVisible();
	await expect(page.getByText("Proxy API")).toBeVisible();
	await assertNoHorizontalOverflow(page);

	await page.evaluate(() => localStorage.setItem("flowvy:mock-role", "user"));
	await page.goto("/support");
	await expect(page.getByRole("heading", { name: "Quick Answers" })).toBeVisible();
	await expect(page.getByRole("heading", { name: "Active Requests" })).toBeVisible();
	await assertNoHorizontalOverflow(page);
});

test("user and admin pages share one external vertical rhythm", async ({
	page,
	mockApi: _mock,
}) => {
	await page.goto("/");
	const accountHeading = page.getByRole("heading", { name: "Account Info" });
	await expect(accountHeading).toBeVisible();
	await page.evaluate(() => document.fonts.ready);

	const gaps = await accountHeading.evaluate((heading) => {
		const accountSection = heading.closest("section");
		const details = accountSection?.parentElement;
		const home = details?.parentElement;
		const inviteCard = details?.previousElementSibling;
		const heroCard = inviteCard?.previousElementSibling;
		const profileSection = accountSection?.nextElementSibling;

		if (!home || !inviteCard || !heroCard || !accountSection || !profileSection) {
			throw new Error("Home section structure is incomplete");
		}

		return {
			heroToInvite:
				inviteCard.getBoundingClientRect().top - heroCard.getBoundingClientRect().bottom,
			inviteToAccount:
				accountSection.getBoundingClientRect().top - inviteCard.getBoundingClientRect().bottom,
			accountToProfile:
				profileSection.getBoundingClientRect().top - accountSection.getBoundingClientRect().bottom,
		};
	});

	expect(gaps.heroToInvite).toBeCloseTo(SECTION_GAP, 1);
	expect(gaps.inviteToAccount).toBeCloseTo(gaps.heroToInvite, 1);
	expect(gaps.accountToProfile).toBeCloseTo(gaps.heroToInvite, 1);
	await expectAttachedSection(accountHeading);

	await page.goto("/devices");
	const devicesGap = await page.getByText("1 / 5", { exact: true }).evaluate((counter) => {
		const header = counter.parentElement?.parentElement;
		const card = header?.nextElementSibling;
		if (!header || !card) throw new Error("Devices section is missing");
		return card.getBoundingClientRect().top - header.getBoundingClientRect().bottom;
	});
	expect(devicesGap).toBeCloseTo(0, 1);
	await expectAttachedSection(page.getByRole("heading", { name: "Connected devices" }));

	await page.goto("/pulse");
	const coreHeading = page.getByRole("heading", { name: "Core" });
	const pulseGap = await coreHeading.evaluate((heading) => {
		const group = heading.closest("section");
		const groups = group?.parentElement;
		const banner = groups?.previousElementSibling;
		if (!group || !groups || !banner) throw new Error("Pulse section structure is incomplete");
		return group.getBoundingClientRect().top - banner.getBoundingClientRect().bottom;
	});
	expect(pulseGap).toBeCloseTo(SECTION_GAP, 1);
	await expectAttachedSection(coreHeading);
	const incidentsHeading = page.getByRole("heading", { name: "Incidents" });
	await expectDirectSectionGap(incidentsHeading);
	await expectAttachedSection(incidentsHeading);

	await page.goto("/admin/dashboard");
	const dashboardTabs = page.getByRole("tablist", { name: "Dashboard view" });
	const dashboardGap = await dashboardTabs.evaluate((tabs) => {
		const content = tabs.nextElementSibling;
		if (!content) throw new Error("Dashboard tab content is missing");
		return content.getBoundingClientRect().top - tabs.getBoundingClientRect().bottom;
	});
	expect(dashboardGap).toBeCloseTo(SECTION_GAP, 1);
	await page.getByRole("tab", { name: "Flowvy Mini-App" }).click();
	const usersHeading = page.getByRole("heading", { name: "Users" });
	await expectDirectSectionGap(usersHeading);
	await expectAttachedSection(usersHeading);

	await page.goto("/admin/users");
	const usersGap = await page.getByRole("button", { name: "Search users" }).evaluate((trigger) => {
		const searchBlock = trigger.parentElement;
		const list = searchBlock?.nextElementSibling;
		if (!searchBlock || !list) throw new Error("Admin users list structure is incomplete");
		return list.getBoundingClientRect().top - searchBlock.getBoundingClientRect().bottom;
	});
	expect(usersGap).toBeCloseTo(SECTION_GAP, 1);

	await page.goto("/admin/users/1");
	const invitations = page.getByRole("heading", { name: "Invitations" });
	const detailGap = await invitations.evaluate((heading) => {
		const invitationSection = heading.closest("section");
		const details = invitationSection?.parentElement;
		const hero = details?.previousElementSibling;
		if (!invitationSection || !details || !hero) {
			throw new Error("Admin user detail structure is incomplete");
		}
		return invitationSection.getBoundingClientRect().top - hero.getBoundingClientRect().bottom;
	});
	expect(detailGap).toBeCloseTo(SECTION_GAP, 1);
	await expectAttachedSection(invitations);

	await page.goto("/admin/settings");
	for (const title of ["Integrations", "Flowvy Mini-App", "System"]) {
		await expect
			.poll(() =>
				page.getByRole("heading", { name: title, exact: true }).evaluate((element) => {
					const groupHeader = element.parentElement;
					const surface = groupHeader?.parentElement;
					return {
						borderBottom: groupHeader ? getComputedStyle(groupHeader).borderBottomWidth : "0px",
						overflow: surface ? getComputedStyle(surface).overflow : "visible",
					};
				}),
			)
			.toEqual({ borderBottom: "1px", overflow: "hidden" });
	}
	await expectDirectSectionGap(page.getByRole("heading", { name: "Flowvy Mini-App" }));

	await page.goto("/admin/settings/access");
	const profiles = page.getByRole("heading", { name: "Access profiles" });
	const accessGap = await profiles.evaluate((heading) => {
		const profilesSection = heading.closest("section");
		const policySection = profilesSection?.previousElementSibling;
		if (!profilesSection || !policySection) {
			throw new Error("Access settings structure is incomplete");
		}
		return (
			profilesSection.getBoundingClientRect().top - policySection.getBoundingClientRect().bottom
		);
	});
	expect(accessGap).toBeCloseTo(SECTION_GAP, 1);

	await page.goto("/admin/settings/welcome");
	await expect(page.getByRole("heading", { name: "Content" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);

	await page.goto("/admin/settings/beszel");
	await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
});

test("admin routes render deterministic success and placeholder states", async ({
	page,
	mockApi,
}) => {
	await page.goto("/admin/dashboard");
	await expect(page.getByRole("tab", { name: "Remnawave" })).toBeVisible();
	await expect(page.getByRole("tab", { name: "Flowvy Mini-App" })).toBeVisible();
	await expect(page.getByText("Remnawave unavailable")).toBeVisible();

	await page.goto("/admin/users");
	await expect(page.getByRole("button", { name: "Search users" })).toBeVisible();
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
	const paymentsCard = page
		.getByRole("heading", { name: "Payments" })
		.locator("xpath=ancestor::section[1]");
	await expect(paymentsCard.getByText("Tribute", { exact: true })).toBeVisible();
	await expect(paymentsCard.getByText("Key added", { exact: true })).toBeVisible();
	for (const brand of ["tribute", "remnawave", "flowvy"]) {
		await expect(page.locator(`svg[data-service-brand="${brand}"]`)).toHaveCount(1);
	}
	await expect(page.getByRole("button", { name: /^Pulse monitoring/ })).toBeVisible();
	const miniAppCard = page
		.getByRole("heading", { name: "Flowvy Mini-App" })
		.locator("xpath=ancestor::section[1]");
	await expect(miniAppCard.getByText("Identity", { exact: true })).toBeVisible();
	await expect(miniAppCard.getByText("Communication", { exact: true })).toBeVisible();
	await expect(miniAppCard.getByText("Registration & Access", { exact: true })).toBeVisible();
	await expect(page.getByText("Branding", { exact: true })).not.toBeVisible();
	for (const [path, title] of [
		["/admin/settings/pulse", "Active source"],
		["/admin/settings/kuma", "Connection"],
		["/admin/settings/beszel", "Connection"],
		["/admin/settings/tribute", "Setup"],
		["/admin/settings/tribute/connection", "Connection"],
		["/admin/settings/branding", "Identity"],
		["/admin/settings/communication", "Registration"],
		["/admin/settings/welcome", "Content"],
		["/admin/settings/content", "Message"],
		["/admin/settings/access", "Registration"],
	] as const) {
		await page.goto(path);
		await expect
			.poll(() =>
				page.getByRole("heading", { name: title, exact: true }).evaluate((element) => {
					const groupHeader = element.parentElement;
					const surface = groupHeader?.parentElement;
					return {
						borderBottom: groupHeader ? getComputedStyle(groupHeader).borderBottomWidth : "0px",
						overflow: surface ? getComputedStyle(surface).overflow : "visible",
					};
				}),
			)
			.toEqual({ borderBottom: "1px", overflow: "hidden" });
	}

	await page.goto("/admin/settings/access");
	await expect(page.getByText("Service mode")).toBeVisible();
	const profilesPanel = page
		.getByRole("heading", { name: "Access profiles" })
		.locator("xpath=ancestor::section[1]");
	await expect(profilesPanel.getByRole("button", { name: "Create profile" })).toBeVisible();
	await expect(
		profilesPanel.getByText(
			/Define benefits, limits, and provider options for registration or automations/,
		),
	).toBeVisible();
	await expect(page.getByRole("button", { name: "Back" })).toHaveCount(0);

	await page.goto("/admin/settings/beszel");
	await expect(page.getByText("Hub URL", { exact: true })).toBeVisible();
	await expect(page.getByText("Configured on server")).toBeVisible();
	await expect(page.getByRole("button", { name: "Back" })).toHaveCount(0);

	mockApi.seedSettings({ contentLocales: { en: { welcomeText: "" } } });
	await page.goto("/admin/settings/welcome");
	await expect(page.getByText("Default media", { exact: true })).toBeVisible();
	const greetingEditor = page.getByLabel("Greeting text");
	await expect(greetingEditor).toHaveAttribute("contenteditable", "true");
	await expect(greetingEditor.locator("p.is-editor-empty")).toHaveAttribute(
		"data-placeholder",
		"Write the greeting shown in Telegram",
	);
	await expect(
		page.getByText("Animation (MP4/GIF) or photo sent with /start command", { exact: true }),
	).toBeVisible();
	await expect(page.getByText("Animation", { exact: true })).toHaveCount(0);
	const premiumNotice = page.getByRole("note");
	await expect(premiumNotice).toContainText("Custom emoji require Telegram Premium");
	await expect(premiumNotice).toBeVisible();

	await page.goto("/admin/broadcast");
	await expect(page.getByRole("heading", { name: "Broadcast" })).toBeVisible();
	await expect(page.getByText("Broadcast is coming soon")).toBeVisible();
	await assertNoHorizontalOverflow(page);
});

test("detail screens rely on Telegram Back instead of duplicate in-content headers", async ({
	page,
	mockApi: _mock,
}) => {
	const detailScreens = [
		{ path: "/admin/settings/pulse", marker: "Active source", title: "Pulse monitoring" },
		{ path: "/admin/settings/kuma", marker: "URL", title: "Uptime Kuma" },
		{ path: "/admin/settings/beszel", marker: "Hub URL", title: "Beszel" },
		{ path: "/admin/settings/tribute", marker: "Setup", title: "Tribute" },
		{ path: "/admin/settings/tribute/connection", marker: "API key", title: "Tribute" },
		{ path: "/admin/settings/branding", marker: "App name", title: "Identity" },
		{ path: "/admin/settings/communication", marker: "Registration", title: "Communication" },
		{ path: "/admin/settings/welcome", marker: "Content", title: "Welcome" },
		{ path: "/admin/settings/access", marker: "Service mode", title: "Access" },
		{ path: "/admin/users/1", marker: "alice", title: null },
	] as const;

	for (const screen of detailScreens) {
		await page.goto(screen.path);
		await expect(page.getByText(screen.marker, { exact: true }).first()).toBeVisible();
		if (screen.title) {
			await expect(page.getByRole("banner").getByText(screen.title, { exact: true })).toBeVisible();
		}
		await expect(page.getByRole("button", { name: "Back" })).toHaveCount(0);
	}
});

test("settings hubs stay accessible without mobile overflow", async ({ page, mockApi: _mock }) => {
	const accessibilityByContext: Array<{
		viewport: string;
		theme: "light" | "dark";
		path: string;
		serious: unknown[];
	}> = [];
	for (const viewport of [
		{ width: 320, height: 568 },
		{ width: 430, height: 932 },
	]) {
		for (const colorScheme of ["light", "dark"] as const) {
			await page.setViewportSize(viewport);
			await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
			for (const path of [
				"/admin/settings/pulse",
				"/admin/settings/tribute",
				"/admin/settings/communication",
			]) {
				await page.goto(path);
				await page.evaluate((theme) => {
					document.documentElement.setAttribute("data-theme", theme);
				}, colorScheme);
				await expect(page.getByRole("main").locator(":scope > div")).toHaveCSS("opacity", "1");
				await assertNoHorizontalOverflow(page);
				const result = await new AxeBuilder({ page }).analyze();
				accessibilityByContext.push({
					viewport: `${viewport.width}x${viewport.height}`,
					theme: colorScheme,
					path,
					serious: result.violations.filter((violation) =>
						["serious", "critical"].includes(violation.impact ?? ""),
					),
				});
			}
		}
	}
	expect(accessibilityByContext.filter(({ serious }) => serious.length > 0)).toEqual([]);
});

test("stable Broadcast Coming Soon screen has no serious automated accessibility violations", async ({
	page,
	mockApi: _mock,
}) => {
	for (const screen of [{ path: "/admin/broadcast", title: "Broadcast" }]) {
		await page.goto(screen.path);
		await expect(page.getByRole("heading", { name: screen.title })).toBeVisible();
		await expect(page.getByRole("main").locator(":scope > div")).toHaveCSS("opacity", "1");

		const result = await new AxeBuilder({ page }).analyze();
		const serious = result.violations.filter((violation) =>
			["serious", "critical"].includes(violation.impact ?? ""),
		);
		expect(serious, screen.path).toEqual([]);
	}
});
