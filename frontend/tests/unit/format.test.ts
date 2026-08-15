import { describe, expect, it, vi } from "vitest";
import {
	getDaysLeft,
	getExpiryColor,
	getTrafficColor,
	getTrafficPercent,
	isUnlimitedDevices,
	isUnlimitedExpiry,
	isUnlimitedTraffic,
	parseExpiry,
} from "../../src/lib/format.ts";

describe("subscription formatting decisions", () => {
	it("clamps traffic percentage and handles unlimited traffic", () => {
		expect(getTrafficPercent(25, 100)).toBe(25);
		expect(getTrafficPercent(150, 100)).toBe(100);
		expect(getTrafficPercent(10, 0)).toBe(0);
		expect(isUnlimitedTraffic(0)).toBe(true);
	});

	it("uses the documented traffic thresholds", () => {
		expect(getTrafficColor(70)).toBe("var(--v2-text-positive)");
		expect(getTrafficColor(71)).toBe("var(--v2-text-warning)");
		expect(getTrafficColor(91)).toBe("var(--v2-text-negative)");
	});

	it("treats null and zero device limits as unlimited", () => {
		expect(isUnlimitedDevices(null)).toBe(true);
		expect(isUnlimitedDevices(0)).toBe(true);
		expect(isUnlimitedDevices(3)).toBe(false);
	});

	it("calculates expiry against a fixed clock", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-08-01T00:00:00Z"));
		const now = Math.floor(Date.now() / 1000);

		expect(getDaysLeft(now + 8 * 86400)).toBe(8);
		expect(getExpiryColor(-1)).toBe("var(--v2-text-negative)");
		expect(getExpiryColor(7)).toBe("var(--v2-text-warning)");
		expect(isUnlimitedExpiry(now + 11 * 365 * 86400)).toBe(false);
		expect(isUnlimitedExpiry("2099-12-31T23:59:59Z")).toBe(true);
		expect(parseExpiry(4_102_444_799)?.isUnlimited).toBe(true);
		expect(parseExpiry("2037-08-01T00:00:00Z")?.isUnlimited).toBe(false);

		vi.useRealTimers();
	});
});
