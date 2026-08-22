import type { UserResponse } from "../hooks/use-auth.ts";
import type { OperatorContent } from "./operator-content.ts";
import type { ProviderUserStatus } from "./user-status.ts";

export type { ProviderUserStatus } from "./user-status.ts";

export type RegistrationMode = "open" | "invite_only";
export type ValidityMode = "duration" | "fixed" | "lifetime" | "automation";
export type TrafficStrategy = "NO_RESET" | "DAY" | "WEEK" | "MONTH" | "MONTH_ROLLING";
export interface OnboardingStatus {
	state: "registered" | "open" | "invite_required";
	registrationMode: RegistrationMode;
	appName: string | null;
	logoUrl: string | null;
	launchInviteAvailable: boolean;
	content: OperatorContent;
}

export interface AccessProfileInput {
	name: string;
	description: string | null;
	validityMode: ValidityMode;
	validityDays: number | null;
	fixedExpireAt: string | null;
	trafficLimitBytes: number;
	trafficLimitStrategy: TrafficStrategy;
	hwidDeviceLimit: number | null;
	tag: string | null;
	status: ProviderUserStatus;
	internalSquadUuids: string[];
	externalSquadUuid: string | null;
}

export interface AccessProfile extends AccessProfileInput {
	id: string;
	isActive: boolean;
	createdAt: string;
	updatedAt: string;
}

export interface RegistrationSettings {
	registrationMode: RegistrationMode;
	defaultAccessProfileId: string | null;
}

export interface ProviderSquad {
	uuid: string;
	name: string;
}

export interface RegistrationOptions {
	internalSquads: ProviderSquad[];
	externalSquads: ProviderSquad[];
	tags: string[];
}

export interface UserInvite {
	code: string;
	invitedCount: number;
	referralUrl: string | null;
	referralStatus: "ready" | "main_app_not_configured" | "telegram_unavailable";
}

export interface PreparedInviteShare {
	id: string;
	expirationDate: string;
}

export interface OnboardingApi {
	status: OnboardingStatus;
	register: () => Promise<UserResponse>;
	redeem: (code: string) => Promise<UserResponse>;
}
