import type { AdminUser } from "../types/admin-users.ts";

type AdminUserIdentity = Pick<AdminUser, "username" | "telegramUsername">;

export function getAdminUserDisplayName(user: AdminUserIdentity): string {
	return user.telegramUsername ? `@${user.telegramUsername}` : user.username;
}

export function getAdminUserProviderName(user: AdminUserIdentity): string | null {
	return user.telegramUsername && user.username !== user.telegramUsername ? user.username : null;
}
