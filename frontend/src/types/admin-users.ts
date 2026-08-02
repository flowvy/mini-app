import type { SubscriptionStatus } from "./subscription.ts";

export interface AdminUserTraffic {
	usedTrafficBytes: number;
	lifetimeUsedTrafficBytes: number;
	onlineAt: string | null;
	firstConnectedAt: string | null;
}

export interface AdminUserInternalSquad {
	name: string;
}

export interface AdminUser {
	id: number;
	username: string;
	status: SubscriptionStatus;
	tag: string | null;
	description: string | null;
	trafficLimitBytes: number;
	trafficLimitStrategy: string;
	expireAt: string;
	telegramId: number | null;
	email: string | null;
	hwidDeviceLimit: number | null;
	createdAt: string;
	subscriptionUrl: string;
	activeInternalSquads: AdminUserInternalSquad[];
	externalSquadName: string | null;
	userTraffic: AdminUserTraffic;
}

export interface AdminUsersResponse {
	users: AdminUser[];
	total: number;
}
