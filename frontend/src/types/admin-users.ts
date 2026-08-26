import type { UserStatus } from "./user-status.ts";

interface AdminUserTraffic {
	usedTrafficBytes: number;
	lifetimeUsedTrafficBytes: number;
	onlineAt: string | null;
	firstConnectedAt: string | null;
}

interface AdminUserInternalSquad {
	name: string;
}

export interface AdminUser {
	id: number;
	username: string;
	telegramUsername: string | null;
	status: UserStatus;
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
	invitedCount: number;
	userTraffic: AdminUserTraffic;
}

export interface AdminUsersResponse {
	users: AdminUser[];
	total: number;
}
