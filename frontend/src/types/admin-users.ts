import type { SubscriptionStatus } from "./subscription.ts";

export interface AdminUserTraffic {
	usedTrafficBytes: number;
	lifetimeUsedTrafficBytes: number;
	onlineAt: string | null;
}

export interface AdminUser {
	uuid: string;
	username: string;
	status: SubscriptionStatus;
	tag: string | null;
	trafficLimitBytes: number;
	trafficLimitStrategy: string;
	expireAt: string;
	telegramId: number | null;
	email: string | null;
	hwidDeviceLimit: number | null;
	createdAt: string;
	subscriptionUrl: string;
	userTraffic: AdminUserTraffic;
}

export interface AdminUsersResponse {
	users: AdminUser[];
	total: number;
}
