import AxeBuilder from "@axe-core/playwright";
import type { Locator } from "@playwright/test";
import { assertNoHorizontalOverflow, expect, test } from "./fixtures/mock-api.ts";

const SECTION_GAP = 8;

async function expectDirectSectionGap(heading: Locator): Promise<void> {
	const gap = await heading.evaluate((element) => {
		const previous = element.previousElementSibling;
		if (!previous) throw new Error("Section heading has no preceding content");
		const paddingTop = Number.parseFloat(getComputedStyle(element).paddingTop);
		return (
			element.getBoundingClientRect().top + paddingTop - previous.getBoundingClientRect().bottom
		);
	});
	expect(gap).toBeCloseTo(SECTION_GAP, 1);
}

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

test("user and admin pages share one external vertical rhythm", async ({
	page,
	mockApi: _mock,
}) => {
	await page.goto("/");
	const accountHeading = page.getByRole("heading", { name: "Account Info" });
	await expect(accountHeading).toBeVisible();
	await page.evaluate(() => document.fonts.ready);

	const gaps = await accountHeading.evaluate((heading) => {
		const details = heading.parentElement;
		const home = details?.parentElement;
		const inviteCard = details?.previousElementSibling;
		const heroCard = inviteCard?.previousElementSibling;
		const accountCard = heading.nextElementSibling;
		const profileHeading = accountCard?.nextElementSibling;

		if (!home || !inviteCard || !heroCard || !accountCard || !profileHeading) {
			throw new Error("Home section structure is incomplete");
		}

		const contentTop = (element: Element) => {
			const style = getComputedStyle(element);
			return element.getBoundingClientRect().top + Number.parseFloat(style.paddingTop);
		};

		return {
			heroToInvite:
				inviteCard.getBoundingClientRect().top - heroCard.getBoundingClientRect().bottom,
			inviteToAccount: contentTop(heading) - inviteCard.getBoundingClientRect().bottom,
			accountToProfile: contentTop(profileHeading) - accountCard.getBoundingClientRect().bottom,
		};
	});

	expect(gaps.heroToInvite).toBeCloseTo(SECTION_GAP, 1);
	expect(gaps.inviteToAccount).toBeCloseTo(gaps.heroToInvite, 1);
	expect(gaps.accountToProfile).toBeCloseTo(gaps.heroToInvite, 1);

	await page.goto("/devices");
	const devicesGap = await page.getByText("1 / 5", { exact: true }).evaluate((counter) => {
		const card = counter.parentElement?.nextElementSibling;
		if (!card) throw new Error("Devices card is missing");
		return card.getBoundingClientRect().top - counter.parentElement.getBoundingClientRect().bottom;
	});
	expect(devicesGap).toBeCloseTo(SECTION_GAP, 1);

	await page.goto("/pulse");
	const coreHeading = page.getByRole("heading", { name: "Core" });
	const pulseGap = await coreHeading.evaluate((heading) => {
		const groups = heading.parentElement?.parentElement;
		const banner = groups?.previousElementSibling;
		if (!groups || !banner) throw new Error("Pulse section structure is incomplete");
		const paddingTop = Number.parseFloat(getComputedStyle(heading).paddingTop);
		return heading.getBoundingClientRect().top + paddingTop - banner.getBoundingClientRect().bottom;
	});
	expect(pulseGap).toBeCloseTo(SECTION_GAP, 1);

	await page.goto("/admin/dashboard");
	const dashboardTabs = page.getByRole("group", { name: "Dashboard view" });
	const dashboardGap = await dashboardTabs.evaluate((tabs) => {
		const content = tabs.nextElementSibling;
		if (!content) throw new Error("Dashboard tab content is missing");
		return content.getBoundingClientRect().top - tabs.getBoundingClientRect().bottom;
	});
	expect(dashboardGap).toBeCloseTo(SECTION_GAP, 1);
	await page.getByRole("button", { name: "Flowvy Mini-App" }).click();
	await expectDirectSectionGap(page.getByRole("heading", { name: "Users" }));

	await page.goto("/admin/users");
	const usersGap = await page.getByRole("textbox", { name: "Search users" }).evaluate((input) => {
		const searchBlock = input.parentElement?.parentElement;
		const list = searchBlock?.nextElementSibling;
		if (!searchBlock || !list) throw new Error("Admin users list structure is incomplete");
		return list.getBoundingClientRect().top - searchBlock.getBoundingClientRect().bottom;
	});
	expect(usersGap).toBeCloseTo(SECTION_GAP, 1);

	await page.goto("/admin/users/1");
	const invitations = page.getByRole("heading", { name: "Invitations" });
	const detailGap = await invitations.evaluate((heading) => {
		const details = heading.parentElement;
		const hero = details?.previousElementSibling;
		if (!details || !hero) throw new Error("Admin user detail structure is incomplete");
		const paddingTop = Number.parseFloat(getComputedStyle(heading).paddingTop);
		return heading.getBoundingClientRect().top + paddingTop - hero.getBoundingClientRect().bottom;
	});
	expect(detailGap).toBeCloseTo(SECTION_GAP, 1);

	await page.goto("/admin/settings");
	await expectDirectSectionGap(page.getByRole("heading", { name: "Flowvy Mini-App" }));

	await page.goto("/admin/settings/access");
	const profiles = page.getByRole("heading", { name: "Access profiles" });
	const accessGap = await profiles.evaluate((heading) => {
		const profilesSection = heading.parentElement?.parentElement;
		const policySection = profilesSection?.previousElementSibling;
		if (!profilesSection || !policySection) {
			throw new Error("Access settings structure is incomplete");
		}
		const paddingTop = Number.parseFloat(getComputedStyle(heading).paddingTop);
		return (
			heading.getBoundingClientRect().top +
			paddingTop -
			policySection.getBoundingClientRect().bottom
		);
	});
	expect(accessGap).toBeCloseTo(SECTION_GAP, 1);

	await page.goto("/admin/settings/welcome");
	await expectDirectSectionGap(page.getByRole("heading", { name: "Media" }));

	await page.goto("/admin/settings/beszel");
	const saveGap = await page.getByRole("button", { name: "Save" }).evaluate((button) => {
		const wrapper = button.parentElement;
		const footer = wrapper?.previousElementSibling;
		if (!wrapper || !footer) throw new Error("Settings save structure is incomplete");
		return wrapper.getBoundingClientRect().top - footer.getBoundingClientRect().bottom;
	});
	expect(saveGap).toBeCloseTo(SECTION_GAP, 1);
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
