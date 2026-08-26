import { describe, expect, it } from "vitest";
import { getActions } from "../../src/components/admin/admin-user-actions.ts";
import type { AdminUser } from "../../src/types/admin-users.ts";
import { isProviderUserStatus, PROVIDER_USER_STATUSES } from "../../src/types/user-status.ts";

function user(status: AdminUser["status"]): AdminUser {
	return {
		id: 1,
		username: "alice",
		telegramUsername: null,
		status,
		tag: null,
		description: null,
		trafficLimitBytes: 0,
		trafficLimitStrategy: "NO_RESET",
		expireAt: "2027-01-01T00:00:00Z",
		telegramId: 123,
		email: null,
		hwidDeviceLimit: null,
		createdAt: "2026-01-01T00:00:00Z",
		subscriptionUrl: "https://example.test/sub/alice",
		activeInternalSquads: [],
		externalSquadName: null,
		invitedCount: 0,
		userTraffic: {
			usedTrafficBytes: 0,
			lifetimeUsedTrafficBytes: 0,
			onlineAt: null,
			firstConnectedAt: null,
		},
	};
}

describe("Remnawave user status", () => {
	it("keeps the locked provider values in one runtime list", () => {
		expect(PROVIDER_USER_STATUSES).toEqual(["ACTIVE", "DISABLED", "LIMITED", "EXPIRED"]);
		for (const status of PROVIDER_USER_STATUSES) expect(isProviderUserStatus(status)).toBe(true);
		expect(isProviderUserStatus("UNKNOWN")).toBe(false);
		expect(isProviderUserStatus("PAUSED")).toBe(false);
	});

	it("does not infer enable or disable for an unknown status", () => {
		const keys = getActions(user("UNKNOWN")).map((action) => action.key);
		expect(keys).toEqual(["reset", "revoke", "delete"]);
	});

	it("preserves the existing active and inactive status actions", () => {
		expect(getActions(user("ACTIVE"))[0]?.key).toBe("disable");
		expect(getActions(user("EXPIRED"))[0]?.key).toBe("enable");
	});
});
