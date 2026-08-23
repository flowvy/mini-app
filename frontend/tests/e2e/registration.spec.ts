import AxeBuilder from "@axe-core/playwright";
import type { Locator } from "@playwright/test";
import { assertNoHorizontalOverflow, expect, test } from "./fixtures/mock-api.ts";
import {
	installTelegramMainButton,
	latestTelegramMainButton,
	withTelegramMainButton,
} from "./fixtures/telegram-main-button.ts";

async function submitEditor(dialog: Locator): Promise<void> {
	await dialog.locator("form").evaluate((form) => (form as HTMLFormElement).requestSubmit());
}

const registeredUser = {
	id: 42,
	username: "new_user",
	full_name: "New User",
	role: "user",
	is_active: true,
	features: { pulse: true },
	branding: {
		appName: "Flowvy",
		logoUrl: null,
	},
};

test("invite-only onboarding handles an invalid code and enters the app without reload", async ({
	page,
	mockApi,
}) => {
	await page.addInitScript(() => localStorage.setItem("flowvy:mock-auth", "onboarding"));
	mockApi.mock("GET", "/api/me", {
		status: 403,
		body: { detail: { code: "invite_required", message: "An invite code is required" } },
	});
	mockApi.mock("GET", "/api/onboarding", {
		body: {
			state: "invite_required",
			registrationMode: "invite_only",
			appName: "Flowvy Test",
			logoUrl: null,
			launchInviteAvailable: false,
		},
	});
	mockApi.mock("POST", "/api/onboarding/redeem", [
		{ status: 400, body: { detail: { code: "invalid_invite", message: "Invite is invalid" } } },
		{ body: registeredUser },
	]);

	await page.goto("/");
	await expect(page.getByRole("heading", { name: "Invitation required" })).toBeVisible();
	await expect(page.getByText("Flowvy Test")).toBeVisible();
	await expect(page).toHaveTitle("Flowvy Test");

	const code = page.getByLabel("Invite code");
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
	await expect(code).toHaveCSS("background-color", standaloneSurface.background);
	await expect(code).toHaveCSS("border-color", standaloneSurface.border);
	await expect(code).toHaveCSS("box-shadow", "none");
	await expect(code).toHaveCSS("outline-style", "none");
	await code.fill("FVY-WRONG-CODE");
	await page.getByRole("button", { name: "Continue" }).click();
	await expect(page.getByRole("alert")).toContainText(
		"This invite code is invalid or no longer available",
	);

	await code.fill("FVY-TEST-CODE-1");
	await code.press("Enter");
	await expect(page.getByText("Account Info")).toBeVisible();
	await assertNoHorizontalOverflow(page);
});

test("invite-only onboarding redeems only the server-validated Main Mini App referral", async ({
	page,
	mockApi,
}) => {
	let requestBody: string | null | undefined;
	page.on("request", (request) => {
		if (new URL(request.url()).pathname === "/api/onboarding/redeem-launch") {
			requestBody = request.postData();
		}
	});
	await page.addInitScript(() => localStorage.setItem("flowvy:mock-auth", "onboarding"));
	mockApi.mock("GET", "/api/me", {
		status: 403,
		body: { detail: { code: "invite_required", message: "An invite code is required" } },
	});
	mockApi.mock("GET", "/api/onboarding", {
		body: {
			state: "invite_required",
			registrationMode: "invite_only",
			appName: "Flowvy Test",
			logoUrl: null,
			launchInviteAvailable: true,
		},
	});
	mockApi.mock("POST", "/api/onboarding/redeem-launch", { body: registeredUser });

	await page.goto("/");
	await expect(page.getByText("Account Info")).toBeVisible();
	await expect
		.poll(
			() => mockApi.calls.filter((call) => call === "POST /api/onboarding/redeem-launch").length,
		)
		.toBe(1);
	expect(requestBody).toBeNull();
});

test("open onboarding preserves the server-validated Main Mini App referral", async ({
	page,
	mockApi,
}) => {
	let requestBody: string | null | undefined;
	page.on("request", (request) => {
		if (new URL(request.url()).pathname === "/api/onboarding/redeem-launch") {
			requestBody = request.postData();
		}
	});
	await page.addInitScript(() => localStorage.setItem("flowvy:mock-auth", "onboarding"));
	mockApi.mock("GET", "/api/me", {
		status: 403,
		body: { detail: { code: "registration_required", message: "Registration is required" } },
	});
	mockApi.mock("GET", "/api/onboarding", {
		body: {
			state: "open",
			registrationMode: "open",
			appName: "Flowvy Test",
			logoUrl: null,
			launchInviteAvailable: true,
		},
	});
	mockApi.mock("POST", "/api/onboarding/redeem-launch", { body: registeredUser });

	await page.goto("/");
	await expect(page.getByText("Account Info")).toBeVisible();
	await expect
		.poll(
			() => mockApi.calls.filter((call) => call === "POST /api/onboarding/redeem-launch").length,
		)
		.toBe(1);
	expect(requestBody).toBeNull();
});

test("open onboarding falls back to regular registration after a stale launch invite", async ({
	page,
	mockApi,
}) => {
	await page.addInitScript(() => localStorage.setItem("flowvy:mock-auth", "onboarding"));
	mockApi.mock("GET", "/api/me", {
		status: 403,
		body: { detail: { code: "registration_required", message: "Registration is required" } },
	});
	mockApi.mock("GET", "/api/onboarding", {
		body: {
			state: "open",
			registrationMode: "open",
			appName: "Flowvy Test",
			logoUrl: null,
			launchInviteAvailable: true,
		},
	});
	mockApi.mock("POST", "/api/onboarding/redeem-launch", {
		status: 400,
		body: { detail: { code: "invalid_invite", message: "Invite is invalid" } },
	});
	mockApi.mock("POST", "/api/onboarding/register", { body: registeredUser });

	await page.goto("/");
	await expect(page.getByRole("alert")).toContainText(
		"This invite code is invalid or no longer available",
	);
	await page.getByRole("button", { name: "Get started" }).click();
	await expect(page.getByText("Account Info")).toBeVisible();
	expect(
		mockApi.calls.filter((call) => call === "POST /api/onboarding/redeem-launch"),
	).toHaveLength(1);
});

test("open onboarding registers with one explicit action", async ({ page, mockApi }) => {
	await page.addInitScript(() => localStorage.setItem("flowvy:mock-auth", "onboarding"));
	mockApi.mock("GET", "/api/me", {
		status: 403,
		body: { detail: { code: "registration_required", message: "Registration is required" } },
	});
	mockApi.mock("GET", "/api/onboarding", {
		body: {
			state: "open",
			registrationMode: "open",
			appName: null,
			logoUrl: null,
			launchInviteAvailable: false,
		},
	});
	mockApi.mock("POST", "/api/onboarding/register", { body: registeredUser });

	await page.goto("/");
	await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
	await page.getByRole("button", { name: "Get started" }).click();
	await expect(page.getByText("Account Info")).toBeVisible();
});

test("admin configures registration policy and the global access profile", async ({
	page,
	mockApi: _mock,
}) => {
	await page.goto("/admin/settings/access");
	await expect(page.getByText("Service mode")).toBeVisible();
	const serviceMode = page.getByRole("radiogroup", { name: "Service mode" });
	await serviceMode.getByRole("radio", { name: "Open" }).focus();
	await page.keyboard.press("ArrowRight");
	await expect(serviceMode.getByRole("radio", { name: "Invite only" })).toHaveAttribute(
		"aria-checked",
		"true",
	);

	const profilesPanel = page
		.getByRole("heading", { name: "Access profiles" })
		.locator("xpath=ancestor::section[1]");
	await profilesPanel.getByRole("button", { name: "Create profile" }).click();
	await expect(page.getByRole("dialog", { name: "Create access profile" })).toBeVisible();
	await expect(page.getByRole("heading", { name: "Create access profile" })).toBeFocused();
	await expect(page.getByText(/Provider options stay under Advanced/)).toBeVisible();
	await page.getByRole("radio", { name: "No expiry" }).click();
	await expect(page.getByText(/No expiration.*fully unlimited access/)).toBeVisible();
	await page.getByRole("radio", { name: "Days" }).click();
	await page.getByPlaceholder("Free 30 days").fill("Weekend trial");
	await page.getByLabel("Number of days").fill("3");
	await page.getByLabel("Traffic (GB, 0 = unlimited)").fill("10");
	await page.getByText("Advanced Remnawave fields").focus();
	await page.keyboard.press("Enter");
	await page.getByLabel("Remnawave tag").selectOption("FREE_TRIAL");
	await page.getByRole("checkbox", { name: "Primary" }).check();
	await page.getByLabel("External squad").selectOption({ label: "Public" });
	await submitEditor(page.getByRole("dialog", { name: "Create access profile" }));
	await expect(page.getByRole("strong").filter({ hasText: "Weekend trial" })).toBeVisible();
	await page.getByRole("button", { name: "Edit access profile" }).last().click();
	await page.getByText("Advanced Remnawave fields").focus();
	await page.keyboard.press("Enter");
	await expect(page.getByLabel("Remnawave tag")).toHaveValue("FREE_TRIAL");
	await expect(page.getByRole("checkbox", { name: "Primary" })).toBeChecked();
	await expect(page.getByLabel("External squad")).toHaveValue(
		"00000000-0000-4000-8000-000000000021",
	);
	await page.getByRole("button", { name: "Close editor" }).click();

	const defaultAccess = page.getByLabel("Default access");
	await defaultAccess.selectOption({ label: "Weekend trial" });
	await expect(defaultAccess).toHaveValue("00000000-0000-4000-8000-000000000003");
	await expect(
		defaultAccess.locator("..").locator("span", { hasText: "Weekend trial" }),
	).toBeVisible();
	await assertNoHorizontalOverflow(page);

	const result = await new AxeBuilder({ page }).analyze();
	const serious = result.violations.filter((violation) =>
		["serious", "critical"].includes(violation.impact ?? ""),
	);
	expect(serious).toEqual([]);
});

test("automation-managed profile stores no local expiry and stays out of registration", async ({
	page,
	mockApi,
}) => {
	await page.goto("/admin/settings/access");
	await page.getByRole("button", { name: "Create profile" }).click();
	await page.getByLabel("Name").fill("Sponsor benefits");
	await page.getByRole("radio", { name: "Automation" }).click();
	await expect(
		page.getByText(
			"No duration or date is stored. A payment rule or another automation must provide the expiry",
		),
	).toBeVisible();
	await expect(page.getByLabel("Number of days")).toHaveCount(0);
	await expect(page.getByRole("textbox", { name: "Expires at" })).toHaveCount(0);

	const requestPromise = page.waitForRequest(
		(request) =>
			request.method() === "POST" &&
			new URL(request.url()).pathname === "/api/debug/admin/registration/access-profiles",
	);
	await submitEditor(page.getByRole("dialog", { name: "Create access profile" }));
	const request = await requestPromise;
	expect(request.postDataJSON()).toMatchObject({
		name: "Sponsor benefits",
		validityMode: "automation",
		validityDays: null,
		fixedExpireAt: null,
	});
	await expect(page.getByText("Sponsor benefits", { exact: true })).toBeVisible();
	await expect(page.getByText(/set by automation, unlimited traffic/)).toBeVisible();
	await expect(
		page.getByLabel("Default access").getByRole("option", { name: "Sponsor benefits" }),
	).toHaveCount(0);
	expect(mockApi.calls).toContain("POST /api/debug/admin/registration/access-profiles");
	await assertNoHorizontalOverflow(page);
});

test("registration default explains why automation-managed expiry cannot be selected", async ({
	page,
	mockApi: _mock,
}) => {
	await installTelegramMainButton(page);
	await page.goto(withTelegramMainButton("/admin/settings/access"));
	await page.getByLabel("Default access").selectOption({ label: "Free 30 days" });
	await page.getByRole("button", { name: "Edit access profile" }).click();
	await page.getByRole("radio", { name: "Automation" }).click();
	await expect(
		page.getByText(
			"This profile is the registration default. Choose another default access profile before using automation-controlled expiry",
		),
	).toBeVisible();
	await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
	await expect
		.poll(() => latestTelegramMainButton(page))
		.toEqual(expect.objectContaining({ text: "Save", is_active: false, is_visible: true }));
	await assertNoHorizontalOverflow(page);
});

test("access editor waits for provider choices without changing the create control geometry", async ({
	page,
	mockApi,
}) => {
	mockApi.mock("GET", "/api/debug/admin/registration/options", {
		body: {
			internalSquads: [],
			externalSquads: [],
			tags: [],
		},
		delayMs: 1_000,
	});

	await page.goto("/admin/settings/access");
	const create = page.getByRole("button", { name: "Create profile" });
	const before = await create.boundingBox();
	await expect(create).toBeDisabled();
	await expect(create).toBeEnabled();
	const after = await create.boundingBox();
	expect(after?.width).toBe(before?.width);
	expect(after?.height).toBe(before?.height);
	await create.click();
	await expect(page.getByRole("heading", { name: "Create access profile" })).toBeVisible();
});

test("empty access profiles keep creation contextual to the collection", async ({
	page,
	mockApi,
}) => {
	mockApi.mock("GET", "/api/debug/admin/registration/access-profiles", { body: [] });

	await page.goto("/admin/settings/access");
	const profilesPanel = page
		.getByRole("heading", { name: "Access profiles" })
		.locator("xpath=ancestor::section[1]");
	await expect(profilesPanel.getByText("No access profiles yet", { exact: true })).toBeVisible();
	await expect(profilesPanel.getByText(/reusable access template/)).toBeVisible();
	const create = profilesPanel.getByRole("button", { name: "Create profile" });
	await expect(create).toBeVisible();
	await create.click();
	await expect(page.getByRole("dialog", { name: "Create access profile" })).toBeVisible();
});

test("access profile editor traps focus, passes Axe, and returns focus to its trigger", async ({
	page,
	mockApi: _mock,
}) => {
	await page.goto("/admin/settings/access");
	const create = page.getByRole("button", { name: "Create profile" });
	await create.click();

	const dialog = page.getByRole("dialog", { name: "Create access profile" });
	await expect(dialog).toBeVisible();
	expect(
		await dialog.evaluate(
			(element) => element.matches(":modal") && element.parentElement === document.body,
		),
	).toBe(true);
	await dialog.evaluate(async (element) => {
		await Promise.all(
			element
				.getAnimations({ subtree: true })
				.map((animation) => animation.finished.catch(() => undefined)),
		);
	});
	const [dialogBox, viewport] = await Promise.all([
		dialog.boundingBox(),
		page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight })),
	]);
	expect(dialogBox).not.toBeNull();
	if (viewport.width <= 600) {
		expect(dialogBox?.x).toBeCloseTo(0, 0);
		expect(dialogBox?.y).toBeCloseTo(0, 0);
		expect(dialogBox?.width).toBeCloseTo(viewport.width, 0);
		expect(dialogBox?.height).toBeCloseTo(viewport.height, 0);
	} else {
		expect(dialogBox?.width ?? viewport.width).toBeLessThan(viewport.width);
		expect(dialogBox?.height ?? viewport.height).toBeLessThan(viewport.height);
	}
	const dialogHeading = page.getByRole("heading", { name: "Create access profile" });
	await expect(dialogHeading).toBeFocused();
	const closeEditor = page.getByRole("button", { name: "Close editor" });
	await closeEditor.focus();
	await page.keyboard.press("Shift+Tab");
	await expect(dialog.locator("summary")).toBeFocused();
	await page.keyboard.press("Tab");
	await expect(closeEditor).toBeFocused();
	await expect(dialog.getByRole("button", { name: "Create profile", exact: true })).toHaveCount(0);
	await expect(dialog.getByRole("button", { name: "Cancel" })).toHaveCount(0);

	const result = await new AxeBuilder({ page }).include("dialog").analyze();
	const serious = result.violations.filter((violation) =>
		["serious", "critical"].includes(violation.impact ?? ""),
	);
	expect(serious).toEqual([]);

	await page.keyboard.press("Escape");
	await expect(dialog).toHaveCount(0);
	await expect(create).toBeFocused();
});

test("home keeps the invite card in skeleton state until the page data settles", async ({
	page,
	mockApi,
}) => {
	mockApi.mock("GET", "/api/me/subscription", {
		status: 404,
		body: { detail: "No subscription" },
		delayMs: 350,
	});

	await page.goto("/");
	await expect(page.getByLabel("Loading invite")).toBeVisible();
	await expect(page.getByText("Invite friends", { exact: true })).not.toBeVisible();

	await expect(page.getByRole("article", { name: "No active subscription" })).toBeVisible();
	await expect(page.getByText("Invite friends", { exact: true })).toBeVisible();
});

test("access editor fails safely when Remnawave options are unavailable", async ({
	page,
	mockApi,
}) => {
	mockApi.mock("GET", "/api/debug/admin/registration/options", {
		status: 502,
		body: { detail: "Remnawave unavailable" },
	});

	await page.goto("/admin/settings/access");
	await page.getByRole("button", { name: "Create profile" }).click();
	await expect(page.getByRole("alert")).toContainText(
		"Remnawave options are temporarily unavailable",
	);
	await page.getByText("Advanced Remnawave fields").focus();
	await page.keyboard.press("Enter");
	await expect(page.getByLabel("Remnawave tag")).toBeDisabled();
	await page.getByPlaceholder("Free 30 days").fill("Local trial");
	await submitEditor(page.getByRole("dialog", { name: "Create access profile" }));
	await expect(page.getByRole("strong").filter({ hasText: "Local trial" })).toBeVisible();
});

test("registered user can copy and share a reusable personal invite", async ({
	page,
	mockApi: _mock,
	browserName,
}) => {
	if (browserName === "chromium") {
		await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
	}
	await page.goto("/");

	await expect(page.getByText("Invite friends")).toBeVisible();
	await expect(page.getByText("FVY-2345-6789-ABCD-EFGH-JKMN")).toBeVisible();
	await expect(page.getByLabel("Registered through your invite")).toContainText("3");
	const copyAction = page.getByText("Copy", { exact: true });
	const copyColors = await copyAction.evaluate((element) => {
		const neutralProbe = document.createElement("span");
		neutralProbe.style.color = "var(--v2-text-secondary)";
		document.body.append(neutralProbe);
		const colors = {
			action: getComputedStyle(element).color,
			neutral: getComputedStyle(neutralProbe).color,
		};
		neutralProbe.remove();
		return colors;
	});
	expect(copyColors.action).toBe(copyColors.neutral);

	await page.getByRole("button", { name: /FVY-2345/ }).click();
	await expect(page.getByText("Copied", { exact: true })).toBeVisible();
	if (browserName === "chromium") {
		await expect
			.poll(() => page.evaluate(() => navigator.clipboard.readText()))
			.toBe("FVY-2345-6789-ABCD-EFGH-JKMN");
	}

	const share = page.getByRole("link", { name: "Share in Telegram" });
	const shareHref = await share.getAttribute("href");
	expect(shareHref).not.toBeNull();
	const shareUrl = new URL(shareHref ?? "");
	const referralUrl = new URL(shareUrl.searchParams.get("url") ?? "");
	expect(shareUrl.origin).toBe("https://t.me");
	expect(shareUrl.pathname).toBe("/share/url");
	expect(referralUrl.searchParams.get("start")).toBe("ref_FVY23456789ABCDEFGHJKMN");
	expect(referralUrl.searchParams.has("startapp")).toBe(false);
	expect(shareUrl.searchParams.get("text")).toContain("FVY-2345-6789-ABCD-EFGH-JKMN");
	await assertNoHorizontalOverflow(page);
});

test("capable Telegram client sends the server-prepared invite", async ({ page, mockApi }) => {
	await page.addInitScript(() => {
		const telegramWindow = window as typeof window & {
			__preparedSharePayload?: Record<string, unknown>;
			Telegram?: { WebView?: { receiveEvent?: (event: string, payload?: unknown) => void } };
		};
		Object.defineProperty(window, "TelegramWebviewProxy", {
			configurable: true,
			value: {
				postEvent: (eventType: string, eventData?: string) => {
					if (eventType !== "web_app_send_prepared_message") return;
					telegramWindow.__preparedSharePayload = eventData ? JSON.parse(eventData) : {};
					window.setTimeout(() => {
						telegramWindow.Telegram?.WebView?.receiveEvent?.("prepared_message_sent", {});
					}, 0);
				},
			},
		});
	});
	await page.goto(withTelegramMainButton("/"));

	const share = page.getByRole("button", { name: "Share in Telegram" });
	await expect(share).toBeVisible();
	await share.click();

	await expect.poll(() => mockApi.calls).toContain("POST /api/me/invite/prepared-share");
	await expect
		.poll(() =>
			page.evaluate(() => {
				const telegramWindow = window as typeof window & {
					__preparedSharePayload?: Record<string, unknown>;
				};
				return telegramWindow.__preparedSharePayload;
			}),
		)
		.toEqual({ id: "prepared-invite-1" });
	await expect(page.getByText(/couldn't prepare this invite/)).toHaveCount(0);
});

test("home does not publish an unverified Telegram referral link", async ({ page, mockApi }) => {
	mockApi.mock("GET", "/api/me/invite", {
		body: {
			code: "FVY-2345-6789-ABCD-EFGH-JKMN",
			invitedCount: 3,
			referralUrl: null,
			referralStatus: "main_app_not_configured",
		},
	});

	await page.goto("/");
	await expect(page.getByText("FVY-2345-6789-ABCD-EFGH-JKMN")).toBeVisible();
	await expect(page.getByText(/Telegram invite link is not configured yet/)).toBeVisible();
	await expect(page.getByRole("link", { name: "Share in Telegram" })).toHaveCount(0);
	await assertNoHorizontalOverflow(page);
});
