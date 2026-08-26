import type { UserStatus } from "./user-status.ts";

type SubscriptionStatus = UserStatus;

export type ResetStrategy = "MONTH" | "MONTH_ROLLING" | "WEEK" | "DAY" | "NO_RESET";

export interface SubscriptionData {
	id: string;
	name: string;
	telegramUsername: string | null;
	status: SubscriptionStatus;
	usedBytes: number;
	totalBytes: number;
	expiresAt: number;
	createdAt: number;
	deviceLimit: number | null;
	resetStrategy: ResetStrategy | null;
	refillDate: number | null;
	lifetimeUsedBytes: number | null;
	updatedAt: number;
	connectionLink: string;
	email: string | null;
	telegramId: string | null;
	autoUpdate: boolean;
	updateInterval: number;
}
