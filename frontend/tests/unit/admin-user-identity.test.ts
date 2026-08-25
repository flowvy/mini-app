import { describe, expect, it } from "vitest";
import {
	getAdminUserDisplayName,
	getAdminUserProviderName,
} from "../../src/lib/admin-user-identity.ts";

function identity(username: string, telegramUsername: string | null) {
	return { username, telegramUsername };
}

describe("admin user identity presentation", () => {
	it("shows Telegram username while retaining the provider identifier", () => {
		const user = identity("tg_123456", "alice");

		expect(getAdminUserDisplayName(user)).toBe("@alice");
		expect(getAdminUserProviderName(user)).toBe("tg_123456");
	});

	it("falls back to provider username when Telegram username is unavailable", () => {
		const user = identity("tg_123456", null);

		expect(getAdminUserDisplayName(user)).toBe("tg_123456");
		expect(getAdminUserProviderName(user)).toBeNull();
	});
});
