export type SubscriptionStatus = "ACTIVE" | "LIMITED" | "DISABLED" | "EXPIRED";

export type ResetStrategy = "MONTH" | "MONTH_ROLLING" | "WEEK" | "DAY" | "NO_RESET";

export interface SubscriptionData {
	id: string;
	name: string;
	status: SubscriptionStatus;
	usedBytes: number;
	totalBytes: number;
	expiresAt: number;
	createdAt: number;
	deviceLimit: number | null;
	resetStrategy: ResetStrategy | null;
	refillDate: number | null;
	lifetimeUsedBytes: number | null;
	updatedAt: string;
	connectionLink: string;
	email: string | null;
	telegramId: string | null;
	autoUpdate: boolean;
	updateInterval: number;
	supportUrl: string | null;
	renewUrl: string | null;
}

export interface ServerData {
	id: string;
	name: string;
	location: string;
	connectionLink: string;
	isOnline: boolean;
}
