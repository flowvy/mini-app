export const PROVIDER_USER_STATUSES = ["ACTIVE", "DISABLED", "LIMITED", "EXPIRED"] as const;

export type ProviderUserStatus = (typeof PROVIDER_USER_STATUSES)[number];
export type UserStatus = ProviderUserStatus | "UNKNOWN";

export function isProviderUserStatus(value: string): value is ProviderUserStatus {
	return (PROVIDER_USER_STATUSES as readonly string[]).includes(value);
}
