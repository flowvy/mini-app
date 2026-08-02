import { type Page, type Route, test as base, expect } from "@playwright/test";

export const mockData = {
	settings: {
		pulseProvider: "kuma",
		kumaUrl: "https://status.example.test",
		kumaSlug: "flowvy",
		beszelUrl: "https://monitor.example.test",
		beszelCredentialsConfigured: true,
		appName: "Flowvy",
		logoUrl: null,
		welcomeText: "Welcome to Flowvy",
		welcomeMediaUrl: null,
		welcomeMediaType: null,
		welcomeMediaFileId: null,
		welcomeMediaFileName: null,
		welcomeButtonText: "Open Flowvy",
		remnawaveVersion: "2.7.4",
		flowvyVersion: "0.1.0",
		updatedAt: 1_785_542_400,
	},
	subscription: {
		id: "sub-1",
		name: "Primary",
		status: "ACTIVE",
		usedBytes: 10 * 1024 ** 3,
		totalBytes: 100 * 1024 ** 3,
		expiresAt: 1_817_078_400,
		createdAt: 1_735_689_600,
		deviceLimit: 5,
		resetStrategy: "MONTH",
		refillDate: 1_788_134_400,
		lifetimeUsedBytes: 20 * 1024 ** 3,
		updatedAt: 1_785_542_400,
		connectionLink: "vless://example.invalid/profile",
		email: "user@example.test",
		telegramId: "123456789",
		autoUpdate: true,
		updateInterval: 12,
	},
	devices: {
		devices: [
			{
				hwid: "device-1",
				platform: "android",
				osVersion: "15",
				deviceModel: "Pixel 8",
				createdAt: 1_785_542_400,
			},
		],
		total: 1,
		limit: 5,
	},
	pulse: {
		overallStatus: "operational",
		groups: [
			{
				name: "Core",
				monitors: [
					{
						id: 1,
						name: "VPN API",
						status: "up",
						uptime24H: 0.9999,
						heartbeats: [{ status: 1, ping: 42 }],
					},
				],
			},
		],
		incidents: [],
	},
	adminUser: {
		id: 1,
		username: "alice",
		status: "ACTIVE",
		tag: "beta",
		description: "Deterministic test user",
		trafficLimitBytes: 100 * 1024 ** 3,
		trafficLimitStrategy: "MONTH",
		expireAt: "2027-08-01T00:00:00Z",
		telegramId: 123456789,
		email: "alice@example.test",
		hwidDeviceLimit: 5,
		createdAt: "2026-01-01T00:00:00Z",
		subscriptionUrl: "https://example.test/sub/user-1",
		activeInternalSquads: [{ name: "Default" }],
		externalSquadName: null,
		userTraffic: {
			usedTrafficBytes: 10 * 1024 ** 3,
			lifetimeUsedTrafficBytes: 20 * 1024 ** 3,
			onlineAt: "2026-08-01T00:00:00Z",
			firstConnectedAt: "2026-01-02T00:00:00Z",
		},
	},
	dashboard: {
		remnawaveStats: null,
		remnawaveBandwidth: null,
		bot: {
			system: {
				cpuCores: 2,
				memoryTotal: 4 * 1024 ** 3,
				memoryUsed: 2 * 1024 ** 3,
				memoryPercent: 50,
				uptimeSeconds: 86400,
				version: "0.1.0",
			},
			users: { totalUsers: 1, newToday: 1, newThisWeek: 1, active1H: 1, active24H: 1 },
			requests: { totalRequests: 10, todayRequests: 2 },
		},
	},
} as const;

interface MockReply {
	status?: number;
	body?: unknown;
	delayMs?: number;
	contentType?: string;
}

interface MockOverride {
	method: string;
	path: string | RegExp;
	replies: MockReply[];
}

export interface MockApi {
	unhandled: string[];
	consoleErrors: string[];
	pageErrors: string[];
	requestFailures: string[];
	calls: string[];
	mock: (method: string, path: string | RegExp, reply: MockReply | MockReply[]) => void;
}

interface MockState {
	settings: Record<string, unknown>;
	devices: { devices: Array<Record<string, unknown>>; total: number; limit: number | null };
}

function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

async function reply(route: Route, response: MockReply): Promise<void> {
	if (response.delayMs) await new Promise((resolve) => setTimeout(resolve, response.delayMs));
	const status = response.status ?? 200;
	if (status === 204) {
		await route.fulfill({ status });
		return;
	}
	const contentType = response.contentType ?? "application/json";
	const body =
		contentType === "application/json"
			? JSON.stringify(response.body === undefined ? {} : response.body)
			: String(response.body ?? "");
	await route.fulfill({ status, contentType, body });
}

function matchesPath(actual: string, expected: string | RegExp): boolean {
	return typeof expected === "string" ? actual === expected : expected.test(actual);
}

async function handleApi(
	route: Route,
	tracker: MockApi,
	overrides: MockOverride[],
	state: MockState,
): Promise<void> {
	const request = route.request();
	const url = new URL(request.url());
	const path = url.pathname;
	const method = request.method();
	const call = `${method} ${path}`;
	tracker.calls.push(call);

	if (method === "OPTIONS") {
		await route.fulfill({ status: 204 });
		return;
	}

	const override = overrides.find((candidate) => {
		if (candidate.method !== method || !matchesPath(path, candidate.path)) return false;
		if (candidate.path instanceof RegExp) candidate.path.lastIndex = 0;
		return true;
	});
	if (override) {
		const response = override.replies.length > 1 ? override.replies.shift() : override.replies[0];
		await reply(route, response ?? {});
		return;
	}

	if (method === "GET" && path === "/api/debug/admin/settings") {
		await reply(route, { body: state.settings });
		return;
	}
	if (method === "PATCH" && path === "/api/debug/admin/settings") {
		state.settings = { ...state.settings, ...(request.postDataJSON() as Record<string, unknown>) };
		await reply(route, { body: state.settings });
		return;
	}
	if (method === "GET" && path === "/api/debug/admin/settings/kuma/test") {
		await reply(route, { body: { ok: true, error: null } });
		return;
	}
	if (method === "GET" && path === "/api/debug/admin/settings/beszel/test") {
		await reply(route, { body: { ok: true, error: null } });
		return;
	}
	if (method === "POST" && path === "/api/debug/admin/settings/welcome-media") {
		await reply(route, {
			body: { fileId: "telegram-file-1", fileName: "welcome.mp4", mediaType: "animation" },
		});
		return;
	}
	if (method === "GET" && path === "/api/me/subscription") {
		await reply(route, { body: mockData.subscription });
		return;
	}
	if (method === "GET" && path === "/api/me/devices") {
		await reply(route, { body: state.devices });
		return;
	}
	if (method === "DELETE" && path === "/api/me/devices") {
		state.devices = { ...state.devices, devices: [], total: 0 };
		await reply(route, { status: 204 });
		return;
	}
	if (method === "DELETE" && path.startsWith("/api/me/devices/")) {
		const hwid = decodeURIComponent(path.slice("/api/me/devices/".length));
		const remaining = state.devices.devices.filter((device) => device.hwid !== hwid);
		state.devices = { ...state.devices, devices: remaining, total: remaining.length };
		await reply(route, { status: 204 });
		return;
	}
	if (method === "GET" && path === "/api/debug/pulse") {
		await reply(route, { body: mockData.pulse });
		return;
	}
	if (method === "GET" && path === "/api/debug/admin/dashboard") {
		await reply(route, { body: mockData.dashboard });
		return;
	}
	if (method === "GET" && path === "/api/debug/admin/users/all") {
		await reply(route, { body: { users: [mockData.adminUser], total: 1 } });
		return;
	}
	if (method === "GET" && path === "/api/debug/admin/users/1") {
		await reply(route, { body: mockData.adminUser });
		return;
	}
	if (/^\/api\/debug\/admin\/users\/1\/(enable|disable|reset-traffic|revoke)$/.test(path)) {
		await reply(route, { body: mockData.adminUser });
		return;
	}
	if (method === "DELETE" && path === "/api/debug/admin/users/1") {
		await reply(route, { status: 204 });
		return;
	}

	tracker.unhandled.push(call);
	await reply(route, { status: 501, body: { detail: "Unhandled mock request" } });
}

export const test = base.extend<{ mockApi: MockApi }>({
	mockApi: async ({ page }, use) => {
		const overrides: MockOverride[] = [];
		const state: MockState = {
			settings: clone(mockData.settings),
			devices: clone(mockData.devices),
		};
		const tracker: MockApi = {
			unhandled: [],
			consoleErrors: [],
			pageErrors: [],
			requestFailures: [],
			calls: [],
			mock(method, path, response) {
				overrides.unshift({
					method: method.toUpperCase(),
					path,
					replies: Array.isArray(response) ? [...response] : [response],
				});
			},
		};

		page.on("console", (message) => {
			if (message.type() !== "error") return;
			const source = message.location().url;
			if (
				source.includes("/api/") &&
				message.text().startsWith("Failed to load resource: the server responded with a status of")
			) {
				return;
			}
			tracker.consoleErrors.push(message.text());
		});
		page.on("pageerror", (error) => tracker.pageErrors.push(error.message));
		page.on("requestfailed", (request) => {
			const errorText = request.failure()?.errorText ?? "";
			if (/aborted|cancelled/i.test(errorText)) return;
			if (!request.url().startsWith("data:")) {
				tracker.requestFailures.push(`${request.method()} ${request.url()} (${errorText})`);
			}
		});
		await page.route("https://telegram.org/js/telegram-web-app.js", (route) =>
			route.fulfill({ status: 200, contentType: "application/javascript", body: "" }),
		);
		await page.route("**/api/**", (route) => handleApi(route, tracker, overrides, state));

		await use(tracker);

		expect(tracker.unhandled, "all API calls must use named fixtures").toEqual([]);
		expect(tracker.consoleErrors, "browser console must stay clean").toEqual([]);
		expect(tracker.pageErrors, "page must not throw").toEqual([]);
		expect(tracker.requestFailures, "network requests must not fail").toEqual([]);
	},
});

export { expect } from "@playwright/test";

export async function assertNoHorizontalOverflow(page: Page): Promise<void> {
	await page.evaluate(() => document.fonts.ready);
	const hasOverflow = await page.evaluate(
		() => document.documentElement.scrollWidth > document.documentElement.clientWidth,
	);
	expect(hasOverflow, "page must fit the viewport horizontally").toBe(false);
}
