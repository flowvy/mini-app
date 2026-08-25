import { type Page, type Route, test as base, expect } from "@playwright/test";
import type { EntitlementOperation } from "../../../src/types/commerce.ts";

export function entitlementOperation(
	overrides: Partial<EntitlementOperation> = {},
): EntitlementOperation {
	return {
		id: "20000000-0000-4000-8000-000000000001",
		eventName: "new_subscription",
		operationKind: "grant",
		status: "applied",
		reasonCode: null,
		providerCreatedAt: "2026-08-14T10:00:00Z",
		telegramUserId: 123456789,
		externalItemId: "456",
		amountMinor: 50000,
		currency: "RUB",
		durationDays: 30,
		targetExpiry: "2026-09-14T10:00:00Z",
		attemptCount: 1,
		createdAt: "2026-08-14T10:00:01Z",
		availableActions: [],
		lastAction: null,
		...overrides,
	};
}

function sponsorOfferPaymentFields(
	input: Record<string, unknown>,
	rule: Record<string, unknown> | undefined,
): Record<string, unknown> {
	const isDonation = rule?.commerceType === "donation";
	const expectedAmountMinor =
		isDonation && typeof input.expectedAmountMinor === "number" ? input.expectedAmountMinor : null;
	const expectedPaymentMode =
		isDonation && ["one_time", "recurring"].includes(String(input.expectedPaymentMode))
			? input.expectedPaymentMode
			: null;
	const expectedProviderPeriod =
		expectedPaymentMode === "recurring" && typeof input.expectedProviderPeriod === "string"
			? input.expectedProviderPeriod
			: null;
	const currency = typeof rule?.currency === "string" ? rule.currency : "RUB";
	const profile = mockData.accessProfiles.find((item) => item.id === rule?.accessProfileId);
	return {
		checkoutUrl: isDonation && typeof input.checkoutUrl === "string" ? input.checkoutUrl : null,
		expectedAmountMinor,
		expectedPaymentMode,
		expectedProviderPeriod,
		priceOptions:
			expectedAmountMinor === null
				? []
				: [
						{
							priceMajor: String(expectedAmountMinor / 100),
							currency,
							period: expectedProviderPeriod,
						},
					],
		requiresNonAnonymous: isDonation,
		benefits: {
			trafficLimitBytes: profile?.trafficLimitBytes ?? 0,
			deviceLimit: profile?.hwidDeviceLimit ?? null,
		},
	};
}

export const mockData = {
	settings: {
		pulseProvider: "kuma",
		kumaUrl: "https://status.example.test",
		kumaSlug: "flowvy",
		beszelUrl: "https://monitor.example.test",
		beszelCredentialsConfigured: true,
		tributeCredentialsConfigured: true,
		tributeDonationUrl: null,
		tributeSubscriptionUrls: {},
		referralRewardEnabled: false,
		referralRewardDays: null,
		referralRewardAccessProfileId: null,
		welcomeDiscountEnabled: false,
		welcomeDiscountOfferId: null,
		welcomeDiscountUrl: null,
		welcomeDiscountPercent: null,
		appName: "Flowvy",
		logoUrl: null,
		welcomeText: "Welcome to Flowvy",
		welcomeMediaUrl: null,
		welcomeMediaType: null,
		welcomeMediaFileId: null,
		welcomeMediaFileName: null,
		welcomeButtonText: "Open Flowvy",
		inviteShareMediaType: null,
		inviteShareMediaFileId: null,
		inviteShareMediaFileName: null,
		inviteSharePreviewMode: "auto",
		inviteShareAllowUserChats: true,
		inviteShareAllowBotChats: false,
		inviteShareAllowGroupChats: true,
		inviteShareAllowChannelChats: false,
		contentDefaultLocale: "en",
		contentLocales: {},
		contentTemplateVariables: {
			welcomeText: ["appName"],
			welcomeButtonText: ["appName"],
			onboardingInviteTitle: ["appName"],
			onboardingInviteDescription: ["appName"],
			onboardingOpenTitle: ["appName"],
			onboardingOpenDescription: ["appName"],
			onboardingRedeemAction: ["appName"],
			onboardingRegisterAction: ["appName"],
			inviteTitle: ["appName"],
			inviteDescription: ["appName"],
			inviteShareText: ["appName", "code"],
			inviteShareButtonText: ["appName"],
			sponsorNoAccessTitle: ["appName"],
			sponsorNoAccessDescription: ["appName"],
			sponsorBaseAccessTitle: ["appName"],
			sponsorBaseAccessDescription: ["appName"],
			sponsorChooseAction: ["appName"],
		},
		sponsorOfferTemplateVariables: ["appName"],
		remnawaveVersion: "2.7.4",
		flowvyVersion: "0.1.0",
		updatedAt: 1_785_542_400,
	},
	subscription: {
		id: "sub-1",
		name: "Primary",
		telegramUsername: null,
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
		connectionLink: "https://panel.example.test/sub/user-1",
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
				userAgent: "Happ/3.11.1 (Android; Pixel 8)",
				requestIp: "192.0.2.42",
				createdAt: 1_785_542_400,
				updatedAt: 1_785_628_800,
			},
		],
		total: 1,
		limit: 5,
	},
	supportRequests: [
		{
			id: "request-31",
			number: 31,
			topic: "connection",
			subject: "Connection stopped working",
			status: "needs_reply",
			updatedAt: "2026-08-24T09:41:00Z",
			lastMessagePreview: "The client still shows a timeout after refresh.",
			unreadCount: 1,
			requester: { id: 11, fullName: "Maria Petrova", username: "maria" },
		},
		{
			id: "request-29",
			number: 29,
			topic: "devices",
			subject: "New phone setup",
			status: "waiting_user",
			updatedAt: "2026-08-23T14:20:00Z",
			lastMessagePreview: "Flowvy Support: Please remove the old phone and try again.",
			unreadCount: 0,
			requester: { id: 12, fullName: "Alex Kim", username: "alex" },
		},
		{
			id: "request-24",
			number: 24,
			topic: "subscription",
			subject: "Subscription renewal",
			status: "resolved",
			updatedAt: "2026-08-18T10:10:00Z",
			lastMessagePreview: "Flowvy Support: Your access has been updated successfully.",
			unreadCount: 0,
			requester: { id: 13, fullName: "Oleg Sidorov", username: null },
		},
	],
	supportCapabilities: {
		attachmentsEnabled: true,
		maxFiles: 5,
		maxFileBytes: 50 * 1024 ** 2,
		maxTotalBytes: 100 * 1024 ** 2,
		allowedExtensions: [
			".jpg",
			".jpeg",
			".png",
			".webp",
			".heic",
			".heif",
			".mp4",
			".mov",
			".webm",
			".m4v",
			".txt",
			".zip",
		],
		attachmentRetentionDays: 3,
		requestRetentionDays: 90,
	},
	supportStorage: {
		configured: true,
		attachmentsEnabled: true,
		bucketName: "flowvy-support",
		endpoint: "https://example.r2.cloudflarestorage.com",
		maxFiles: 5,
		maxFileBytes: 50 * 1024 ** 2,
		maxTotalBytes: 100 * 1024 ** 2,
		allowedExtensions: [".jpg", ".png", ".mp4", ".mov", ".txt", ".zip"],
		attachmentRetentionDays: 3,
		requestRetentionDays: 90,
		requiredEnvironment: [
			"R2_ACCOUNT_ID",
			"R2_BUCKET_NAME",
			"R2_ACCESS_KEY_ID",
			"R2_SECRET_ACCESS_KEY",
		],
	},
	supportDetails: {
		"request-31": {
			id: "request-31",
			number: 31,
			topic: "connection",
			subject: "Connection stopped working",
			status: "needs_reply",
			updatedAt: "2026-08-24T09:41:00Z",
			lastMessagePreview: "The client still shows a timeout after refresh.",
			unreadCount: 1,
			requester: { id: 11, fullName: "Maria Petrova", username: "maria" },
			context: { subscriptionStatus: "Active", device: "iPhone 16 · iOS 20", appVersion: "0.1.0" },
			messages: [
				{
					id: "message-1",
					author: "user",
					authorName: "Maria",
					body: "The connection stopped working this morning on my iPhone. I refreshed the app, but it still cannot connect.",
					createdAt: "2026-08-24T07:18:00Z",
					attachments: [
						{
							id: "attachment-image",
							name: "connection-error.png",
							kind: "image",
							sizeBytes: 862208,
							passwordProtected: false,
						},
						{
							id: "attachment-video",
							name: "screen-recording.mov",
							kind: "video",
							sizeBytes: 40265318,
							passwordProtected: false,
						},
						{
							id: "attachment-text",
							name: "client-log.txt",
							kind: "text",
							sizeBytes: 18432,
							passwordProtected: false,
						},
						{
							id: "attachment-zip",
							name: "client-report.zip",
							kind: "zip",
							sizeBytes: 5033165,
							passwordProtected: true,
						},
					],
				},
				{
					id: "message-2",
					author: "support",
					authorName: "Nikita · Flowvy Support",
					body: "I checked the subscription — it is **active**. Please refresh the subscription profile in your client, then try connecting again.",
					createdAt: "2026-08-24T09:10:00Z",
					attachments: [],
				},
				{
					id: "message-3",
					author: "user",
					authorName: "Maria",
					body: "The client still shows a timeout after refresh.",
					createdAt: "2026-08-24T09:41:00Z",
					attachments: [],
				},
			],
		},
		"request-29": {
			id: "request-29",
			number: 29,
			topic: "devices",
			subject: "New phone setup",
			status: "waiting_user",
			updatedAt: "2026-08-23T14:20:00Z",
			lastMessagePreview: "Flowvy Support: Please remove the old phone and try again.",
			unreadCount: 0,
			requester: { id: 12, fullName: "Alex Kim", username: "alex" },
			context: {
				subscriptionStatus: "Active",
				device: "Pixel 10 · Android 17",
				appVersion: "0.1.0",
			},
			messages: [
				{
					id: "message-29",
					author: "support",
					authorName: "Flowvy Support",
					body: "Please remove the old phone and try again.",
					createdAt: "2026-08-23T14:20:00Z",
					attachments: [],
				},
			],
		},
		"request-24": {
			id: "request-24",
			number: 24,
			topic: "subscription",
			subject: "Subscription renewal",
			status: "resolved",
			updatedAt: "2026-08-18T10:10:00Z",
			lastMessagePreview: "Flowvy Support: Your access has been updated successfully.",
			unreadCount: 0,
			requester: { id: 13, fullName: "Oleg Sidorov", username: null },
			context: { subscriptionStatus: "Active", device: "Windows 11", appVersion: "0.1.0" },
			messages: [
				{
					id: "message-24",
					author: "support",
					authorName: "Flowvy Support",
					body: "Your access has been updated successfully.",
					createdAt: "2026-08-18T10:10:00Z",
					attachments: [],
				},
			],
		},
	},
	supportArticles: [
		{
			id: "61000000-0000-4000-8000-000000000001",
			topic: "connection",
			status: "published",
			sortOrder: 1,
			contentLocales: {
				en: {
					title: "Connection does not work",
					summary: "Check the client, profile, and connection basics.",
					body: "Start with these checks:\n\n1. Confirm your subscription is active.\n2. Refresh the subscription profile in Flowvy Desktop.\n3. Try another network.\n\nIf the connection still times out, create a request and attach a screenshot or screen recording.",
				},
			},
			publishedAt: "2026-08-20T10:00:00Z",
			createdAt: "2026-08-19T10:00:00Z",
			updatedAt: "2026-08-20T10:00:00Z",
		},
		{
			id: "61000000-0000-4000-8000-000000000002",
			topic: "devices",
			status: "published",
			sortOrder: 2,
			contentLocales: {
				en: {
					title: "Set up Flowvy on a new device",
					summary: "Move access to a phone or computer without losing the profile.",
					body: "Add the new device by opening Flowvy and importing your current subscription link. If the device limit is reached, remove the old device first.",
				},
			},
			publishedAt: "2026-08-21T11:00:00Z",
			createdAt: "2026-08-21T09:00:00Z",
			updatedAt: "2026-08-21T11:00:00Z",
		},
		{
			id: "61000000-0000-4000-8000-000000000003",
			topic: "subscription",
			status: "draft",
			sortOrder: 3,
			contentLocales: {
				en: {
					title: "Refresh a subscription profile",
					summary: "Update servers and access settings in Flowvy Desktop.",
					body: "Open the subscription menu and select **Refresh**.",
				},
			},
			publishedAt: null,
			createdAt: "2026-08-22T12:00:00Z",
			updatedAt: "2026-08-22T12:00:00Z",
		},
	],
	pulse: {
		overallStatus: "operational",
		groups: [
			{
				name: "Core",
				monitors: [
					{
						id: 1,
						name: "Proxy API",
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
		username: "tg_123456789",
		telegramUsername: "alice",
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
		invitedCount: 3,
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
	registration: {
		registrationMode: "open",
		defaultAccessProfileId: null,
	},
	accessProfiles: [
		{
			id: "00000000-0000-4000-8000-000000000001",
			name: "Free 30 days",
			description: "Default test profile",
			validityMode: "duration",
			validityDays: 30,
			fixedExpireAt: null,
			trafficLimitBytes: 50 * 1024 ** 3,
			trafficLimitStrategy: "MONTH",
			hwidDeviceLimit: 3,
			tag: "FREE",
			status: "ACTIVE",
			internalSquadUuids: ["00000000-0000-4000-8000-000000000011"],
			externalSquadUuid: null,
			isActive: true,
			createdAt: "2026-08-01T00:00:00Z",
			updatedAt: "2026-08-01T00:00:00Z",
		},
	],
	commerceRules: [],
	sponsorOffers: [],
	sponsorState: {
		status: "no_access",
		accessLevel: "none",
		primaryAction: "none",
		paidExpiresAt: null,
		baseExpiresAt: null,
		currentOfferId: null,
		managementUrl: null,
		pendingCheckout: null,
		offers: [],
	},
	commerceCatalog: {
		subscriptions: [
			{
				externalItemId: "12",
				name: "Supporter",
				currency: "RUB",
				periods: [
					{ periodId: "34", period: "monthly", priceMajor: "500" },
					{ periodId: "35", period: "yearly", priceMajor: "3500" },
				],
			},
		],
	},
	registrationOptions: {
		internalSquads: [{ uuid: "00000000-0000-4000-8000-000000000011", name: "Primary" }],
		externalSquads: [{ uuid: "00000000-0000-4000-8000-000000000021", name: "Public" }],
		tags: ["FREE", "FREE_TRIAL", "PREMIUM"],
	},
	invite: {
		code: "FVY-2345-6789-ABCD-EFGH-JKMN",
		invitedCount: 3,
		referralUrl: "https://t.me/flowvy_testBot?start=ref_FVY23456789ABCDEFGHJKMN",
		referralStatus: "ready",
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
	seedSettings: (patch: Record<string, unknown>) => void;
	seedAccessProfiles: (profiles: Array<Record<string, unknown>>) => void;
	seedCommerceRules: (rules: Array<Record<string, unknown>>) => void;
	seedSponsorOffers: (offers: Array<Record<string, unknown>>) => void;
	seedSponsorState: (state: Record<string, unknown>) => void;
	seedSupportArticles: (articles: Array<Record<string, unknown>>) => void;
}

interface MockState {
	settings: Record<string, unknown>;
	devices: { devices: Array<Record<string, unknown>>; total: number; limit: number | null };
	registration: Record<string, unknown>;
	accessProfiles: Array<Record<string, unknown>>;
	commerceRules: Array<Record<string, unknown>>;
	sponsorOffers: Array<Record<string, unknown>>;
	sponsorState: Record<string, unknown>;
	supportRequests: Array<Record<string, unknown>>;
	supportDetails: Record<string, Record<string, unknown>>;
	supportArticles: Array<Record<string, unknown>>;
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

function supportPublicArticle(article: Record<string, unknown>): Record<string, unknown> {
	const locales = article.contentLocales as Record<string, Record<string, unknown>>;
	const content = locales.en ?? Object.values(locales)[0] ?? {};
	return {
		id: article.id,
		topic: article.topic,
		title: content.title,
		summary: content.summary,
		body: content.body,
		updatedAt: article.updatedAt,
	};
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
	if (method === "POST" && path === "/api/debug/admin/settings/kuma/test") {
		await reply(route, { body: { ok: true, error: null } });
		return;
	}
	if (method === "POST" && path === "/api/debug/admin/settings/beszel/test") {
		await reply(route, { body: { ok: true, error: null } });
		return;
	}
	if (method === "POST" && path === "/api/debug/admin/settings/tribute/test") {
		await reply(route, { body: { ok: true, error: null } });
		return;
	}
	if (method === "POST" && path === "/api/debug/admin/settings/welcome-media") {
		await reply(route, {
			body: { fileId: "telegram-file-1", fileName: "welcome.mp4", mediaType: "animation" },
		});
		return;
	}
	if (method === "POST" && path === "/api/debug/admin/settings/invite-share-media") {
		await reply(route, {
			body: { fileId: "telegram-invite-file-1", fileName: "invite.mp4", mediaType: "video" },
		});
		return;
	}
	if (method === "POST" && path === "/api/me/invite/prepared-share") {
		await reply(route, {
			body: { id: "prepared-invite-1", expirationDate: "2026-08-22T12:00:00Z" },
		});
		return;
	}
	if (method === "GET" && path === "/api/debug/admin/commerce/rules") {
		await reply(route, { body: state.commerceRules });
		return;
	}
	if (method === "GET" && path === "/api/debug/admin/commerce/catalog") {
		await reply(route, { body: mockData.commerceCatalog });
		return;
	}
	if (method === "GET" && path === "/api/debug/admin/commerce/operations") {
		await reply(route, { body: { operations: [], hasMore: false } });
		return;
	}
	if (method === "GET" && path === "/api/debug/admin/commerce/offers") {
		await reply(route, { body: state.sponsorOffers });
		return;
	}
	if (method === "POST" && path === "/api/debug/admin/commerce/offers") {
		const input = request.postDataJSON() as Record<string, unknown>;
		const rule = state.commerceRules.find((item) => item.id === input.commerceRuleId);
		const created = {
			...input,
			id: `30000000-0000-4000-8000-${String(state.sponsorOffers.length + 1).padStart(12, "0")}`,
			provider: "tribute",
			commerceType: rule?.commerceType ?? "donation",
			paymentMode: rule?.paymentMode ?? "one_time",
			externalItemId: rule?.externalItemId ?? null,
			...sponsorOfferPaymentFields(input, rule),
			availability: input.isPublished ? "ready" : "draft",
		};
		state.sponsorOffers.push(created);
		await reply(route, { status: 201, body: created });
		return;
	}
	const sponsorOfferMatch = path.match(/^\/api\/debug\/admin\/commerce\/offers\/([^/]+)$/);
	if (sponsorOfferMatch && method === "PUT") {
		const input = request.postDataJSON() as Record<string, unknown>;
		const index = state.sponsorOffers.findIndex((offer) => offer.id === sponsorOfferMatch[1]);
		const ruleId = input.commerceRuleId ?? state.sponsorOffers[index]?.commerceRuleId;
		const rule = state.commerceRules.find((item) => item.id === ruleId);
		state.sponsorOffers[index] = {
			...state.sponsorOffers[index],
			...input,
			provider: "tribute",
			commerceType: rule?.commerceType ?? state.sponsorOffers[index]?.commerceType,
			paymentMode: rule?.paymentMode ?? state.sponsorOffers[index]?.paymentMode,
			externalItemId: rule?.externalItemId ?? null,
			...sponsorOfferPaymentFields(input, rule),
			id: sponsorOfferMatch[1],
			availability: input.isPublished ? "ready" : "draft",
		};
		await reply(route, { body: state.sponsorOffers[index] });
		return;
	}
	if (sponsorOfferMatch && method === "DELETE") {
		state.sponsorOffers = state.sponsorOffers.filter((offer) => offer.id !== sponsorOfferMatch[1]);
		await reply(route, { status: 204 });
		return;
	}
	if (method === "POST" && path === "/api/debug/admin/commerce/rules") {
		const input = request.postDataJSON() as Record<string, unknown>;
		const created = {
			...input,
			id: `10000000-0000-4000-8000-${String(state.commerceRules.length + 1).padStart(12, "0")}`,
		};
		state.commerceRules.push(created);
		await reply(route, { status: 201, body: created });
		return;
	}
	const commerceRuleMatch = path.match(/^\/api\/debug\/admin\/commerce\/rules\/([^/]+)$/);
	if (commerceRuleMatch && method === "PUT") {
		const input = request.postDataJSON() as Record<string, unknown>;
		const index = state.commerceRules.findIndex((rule) => rule.id === commerceRuleMatch[1]);
		state.commerceRules[index] = { ...input, id: commerceRuleMatch[1] };
		await reply(route, { body: state.commerceRules[index] });
		return;
	}
	if (commerceRuleMatch && method === "DELETE") {
		state.commerceRules = state.commerceRules.filter((rule) => rule.id !== commerceRuleMatch[1]);
		state.sponsorOffers = state.sponsorOffers.filter(
			(offer) => offer.commerceRuleId !== commerceRuleMatch[1],
		);
		await reply(route, { status: 204 });
		return;
	}
	if (method === "POST" && path === "/api/debug/admin/commerce/preview") {
		const body = request.postDataJSON() as {
			amountMinor: number;
			rule: {
				calculationType: "fixed" | "volume" | "provider_expiry";
				fixedDurationDays: number | null;
				amountBands: Array<{
					fromAmountMinor: number;
					unitAmountMinor: number;
					unitDays: number;
				}>;
			};
		};
		if (body.rule.calculationType === "fixed") {
			await reply(route, {
				body: { matched: true, durationDays: body.rule.fixedDurationDays, matchedBand: null },
			});
			return;
		}
		if (body.rule.calculationType === "provider_expiry") {
			await reply(route, {
				status: 422,
				body: { detail: "Provider expiry has no amount preview" },
			});
			return;
		}
		const matchedBand = [...body.rule.amountBands]
			.sort((left, right) => left.fromAmountMinor - right.fromAmountMinor)
			.filter((band) => body.amountMinor >= band.fromAmountMinor)
			.at(-1);
		await reply(route, {
			body: matchedBand
				? {
						matched: true,
						durationDays: Math.floor(
							(body.amountMinor * matchedBand.unitDays) / matchedBand.unitAmountMinor,
						),
						matchedBand,
					}
				: { matched: false, durationDays: null, matchedBand: null },
		});
		return;
	}
	if (method === "GET" && path === "/api/debug/admin/registration") {
		await reply(route, { body: state.registration });
		return;
	}
	if (method === "PATCH" && path === "/api/debug/admin/registration") {
		state.registration = {
			...state.registration,
			...(request.postDataJSON() as Record<string, unknown>),
		};
		await reply(route, { body: state.registration });
		return;
	}
	if (method === "GET" && path === "/api/debug/admin/registration/options") {
		await reply(route, { body: mockData.registrationOptions });
		return;
	}
	if (method === "GET" && path === "/api/debug/admin/registration/access-profiles") {
		await reply(route, { body: state.accessProfiles });
		return;
	}
	if (method === "POST" && path === "/api/debug/admin/registration/access-profiles") {
		const input = request.postDataJSON() as Record<string, unknown>;
		const created = {
			...input,
			id: `00000000-0000-4000-8000-${String(state.accessProfiles.length + 2).padStart(12, "0")}`,
			isActive: true,
			createdAt: "2026-08-02T00:00:00Z",
			updatedAt: "2026-08-02T00:00:00Z",
		};
		state.accessProfiles.push(created);
		await reply(route, { status: 201, body: created });
		return;
	}
	const profileMatch = path.match(/^\/api\/debug\/admin\/registration\/access-profiles\/([^/]+)$/);
	if (profileMatch && method === "PUT") {
		const input = request.postDataJSON() as Record<string, unknown>;
		const index = state.accessProfiles.findIndex((profile) => profile.id === profileMatch[1]);
		state.accessProfiles[index] = {
			...state.accessProfiles[index],
			...input,
			updatedAt: "2026-08-02T00:00:00Z",
		};
		await reply(route, { body: state.accessProfiles[index] });
		return;
	}
	if (profileMatch && method === "DELETE") {
		const profile = state.accessProfiles.find((candidate) => candidate.id === profileMatch[1]);
		if (profile) profile.isActive = false;
		await reply(route, { status: 204 });
		return;
	}
	if (method === "GET" && (path === "/api/me/invite" || /^\/api\/debug\/invite\/\d+$/.test(path))) {
		await reply(route, { body: mockData.invite });
		return;
	}
	if (
		method === "GET" &&
		(path === "/api/me/subscription" || /^\/api\/debug\/subscription\/\d+$/.test(path))
	) {
		await reply(route, { body: mockData.subscription });
		return;
	}
	if (
		method === "GET" &&
		(path === "/api/me/sponsor" || /^\/api\/debug\/sponsor\/\d+$/.test(path))
	) {
		await reply(route, { body: state.sponsorState });
		return;
	}
	if (
		method === "POST" &&
		(path === "/api/me/sponsor/checkouts" || /^\/api\/debug\/sponsor\/\d+\/checkouts$/.test(path))
	) {
		const input = request.postDataJSON() as { offerId: string };
		const offer = state.sponsorOffers.find((item) => item.id === input.offerId);
		const checkout = {
			id: "40000000-0000-4000-8000-000000000001",
			offerId: input.offerId,
			status: "pending",
			checkoutUrl: offer?.checkoutUrl ?? "https://t.me/tribute/app?startapp=checkout_test",
			expiresAt: "2026-08-14T12:30:00Z",
		};
		state.sponsorState = {
			...state.sponsorState,
			status: "checkout_pending",
			primaryAction: "continue_checkout",
			pendingCheckout: checkout,
		};
		await reply(route, { status: 201, body: checkout });
		return;
	}
	if (
		method === "DELETE" &&
		(/^\/api\/me\/sponsor\/checkouts\/[^/]+$/.test(path) ||
			/^\/api\/debug\/sponsor\/\d+\/checkouts\/[^/]+$/.test(path))
	) {
		const hasBaseAccess = state.sponsorState.accessLevel === "base";
		state.sponsorState = {
			...state.sponsorState,
			status: hasBaseAccess ? "base_access" : "no_access",
			primaryAction: "choose_offer",
			pendingCheckout: null,
		};
		await reply(route, { status: 204 });
		return;
	}
	if (method === "GET" && path === "/api/me/devices") {
		await reply(route, { body: state.devices });
		return;
	}
	if (method === "GET" && path === "/api/support/articles") {
		await reply(route, {
			body: {
				articles: state.supportArticles
					.filter((article) => article.status === "published")
					.map(supportPublicArticle),
			},
		});
		return;
	}
	const publicSupportArticleMatch = path.match(/^\/api\/support\/articles\/([^/]+)$/);
	if (method === "GET" && publicSupportArticleMatch) {
		const id = decodeURIComponent(publicSupportArticleMatch[1]);
		const article = state.supportArticles.find(
			(item) => item.id === id && item.status === "published",
		);
		await reply(
			route,
			article
				? { body: supportPublicArticle(article) }
				: { status: 404, body: { detail: "Article not found" } },
		);
		return;
	}
	const isAdminSupportArticles =
		path === "/api/admin/support/articles" || path === "/api/debug/admin/support/articles";
	if (method === "GET" && isAdminSupportArticles) {
		await reply(route, { body: { articles: state.supportArticles } });
		return;
	}
	if (method === "POST" && isAdminSupportArticles) {
		const input = request.postDataJSON() as Record<string, unknown>;
		const created = {
			...input,
			id: `61000000-0000-4000-8000-${String(state.supportArticles.length + 1).padStart(12, "0")}`,
			sortOrder: state.supportArticles.length + 1,
			publishedAt: input.status === "published" ? "2026-08-24T12:00:00Z" : null,
			createdAt: "2026-08-24T12:00:00Z",
			updatedAt: "2026-08-24T12:00:00Z",
		};
		state.supportArticles.push(created);
		await reply(route, { status: 201, body: created });
		return;
	}
	if (
		method === "PUT" &&
		(path === "/api/admin/support/articles/order/all" ||
			path === "/api/debug/admin/support/articles/order/all")
	) {
		const { articleIds } = request.postDataJSON() as { articleIds: string[] };
		const byId = new Map(state.supportArticles.map((article) => [article.id, article]));
		state.supportArticles = articleIds.map((id, index) => ({
			...byId.get(id),
			sortOrder: index + 1,
			updatedAt: "2026-08-24T12:05:00Z",
		}));
		await reply(route, { body: { articles: state.supportArticles } });
		return;
	}
	const adminSupportArticleMatch = path.match(
		/^\/api\/(?:debug\/)?admin\/support\/articles\/([^/]+)$/,
	);
	if (adminSupportArticleMatch) {
		const id = decodeURIComponent(adminSupportArticleMatch[1]);
		const index = state.supportArticles.findIndex((article) => article.id === id);
		if (index < 0) {
			await reply(route, { status: 404, body: { detail: "Article not found" } });
			return;
		}
		if (method === "GET") {
			await reply(route, { body: state.supportArticles[index] });
			return;
		}
		if (method === "PUT") {
			const input = request.postDataJSON() as Record<string, unknown>;
			const current = state.supportArticles[index];
			const updated = {
				...current,
				...input,
				publishedAt:
					input.status === "published" ? (current.publishedAt ?? "2026-08-24T12:10:00Z") : null,
				updatedAt: "2026-08-24T12:10:00Z",
			};
			state.supportArticles[index] = updated;
			await reply(route, { body: updated });
			return;
		}
		if (method === "DELETE") {
			state.supportArticles.splice(index, 1);
			await reply(route, { status: 204 });
			return;
		}
	}
	if (method === "GET" && path === "/api/support/requests") {
		await reply(route, { body: { requests: state.supportRequests } });
		return;
	}
	if (method === "GET" && path === "/api/support/capabilities") {
		await reply(route, { body: mockData.supportCapabilities });
		return;
	}
	if (method === "POST" && path === "/api/support/uploads") {
		const input = request.postDataJSON() as { files: Array<Record<string, unknown>> };
		await reply(route, {
			body: {
				uploads: input.files.map((file, index) => ({
					id: `attachment-upload-${index + 1}`,
					uploadUrl: `${url.origin}/__r2-upload/${index + 1}`,
					headers: {
						"Content-Type": file.contentType,
						"x-amz-checksum-sha256": file.checksumSha256,
					},
					expiresAt: "2026-08-24T12:10:00Z",
				})),
			},
		});
		return;
	}
	const supportRequestMatch = path.match(/^\/api\/support\/requests\/([^/]+)$/);
	if (method === "GET" && supportRequestMatch) {
		const detail = state.supportDetails[decodeURIComponent(supportRequestMatch[1])];
		await reply(
			route,
			detail ? { body: detail } : { status: 404, body: { detail: "Request not found" } },
		);
		return;
	}
	if (method === "POST" && path === "/api/support/requests") {
		const created = clone(state.supportDetails["request-31"]);
		created.id = "request-32";
		created.number = 32;
		state.supportDetails["request-32"] = created;
		state.supportRequests.unshift(created);
		await reply(route, { body: created });
		return;
	}
	const supportActionMatch = path.match(
		/^\/api\/support\/requests\/([^/]+)\/(messages|resolve|reopen)$/,
	);
	if (method === "POST" && supportActionMatch) {
		const id = decodeURIComponent(supportActionMatch[1]);
		const action = supportActionMatch[2];
		const detail = state.supportDetails[id];
		if (!detail) {
			await reply(route, { status: 404, body: { detail: "Request not found" } });
			return;
		}
		detail.status = action === "resolve" ? "resolved" : "waiting_user";
		if (action === "messages") {
			(detail.messages as Array<Record<string, unknown>>).push({
				id: "message-new",
				author: "support",
				authorName: "Flowvy Support",
				body: "Please try the refreshed profile once more.",
				createdAt: "2026-08-24T10:05:00Z",
				attachments: [],
			});
		}
		const summary = state.supportRequests.find((item) => item.id === id);
		if (summary) summary.status = detail.status;
		await reply(route, { body: detail });
		return;
	}
	if (
		method === "GET" &&
		path.endsWith("/download") &&
		path.startsWith("/api/support/attachments/")
	) {
		await reply(route, {
			body: {
				url: "data:application/octet-stream;base64,Zml4dHVyZQ==",
				expiresAt: "2026-08-24T12:01:00Z",
				fileName: "fixture.txt",
			},
		});
		return;
	}
	if (
		method === "GET" &&
		(path === "/api/admin/settings/support-storage" ||
			path === "/api/debug/admin/settings/support-storage")
	) {
		await reply(route, { body: mockData.supportStorage });
		return;
	}
	if (
		method === "POST" &&
		(path === "/api/admin/settings/support-storage/test" ||
			path === "/api/debug/admin/settings/support-storage/test")
	) {
		await reply(route, { body: { ok: true, errorCode: null } });
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
			registration: clone(mockData.registration),
			accessProfiles: clone(mockData.accessProfiles),
			commerceRules: clone(mockData.commerceRules),
			sponsorOffers: clone(mockData.sponsorOffers),
			sponsorState: clone(mockData.sponsorState),
			supportRequests: clone(mockData.supportRequests),
			supportDetails: clone(mockData.supportDetails),
			supportArticles: clone(mockData.supportArticles),
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
			seedSettings(patch) {
				state.settings = { ...state.settings, ...clone(patch) };
			},
			seedAccessProfiles(profiles) {
				state.accessProfiles = clone(profiles);
			},
			seedCommerceRules(rules) {
				state.commerceRules = clone(rules);
			},
			seedSponsorOffers(offers) {
				state.sponsorOffers = clone(offers);
			},
			seedSponsorState(sponsorState) {
				state.sponsorState = clone(sponsorState);
			},
			seedSupportArticles(articles) {
				state.supportArticles = clone(articles);
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
		await page.route("**/__r2-upload/**", async (route) => {
			tracker.calls.push(`${route.request().method()} /__r2-upload`);
			await route.fulfill({ status: 200, body: "" });
		});
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
