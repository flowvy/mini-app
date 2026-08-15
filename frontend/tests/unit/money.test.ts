import { describe, expect, it } from "vitest";
import {
	currencyFractionDigits,
	formatMajorMoney,
	formatMinorMoney,
	majorToMinor,
	minorToMajorInput,
} from "../../src/lib/money.ts";

describe("minor-unit money fields", () => {
	it("parses currencies without floating-point arithmetic", () => {
		expect(majorToMinor("500", "RUB")).toBe(50_000);
		expect(majorToMinor("12,34", "EUR")).toBe(1_234);
		expect(majorToMinor("12.345", "EUR")).toBeNull();
	});

	it("uses the runtime ISO fraction digits", () => {
		expect(currencyFractionDigits("JPY")).toBe(0);
		expect(majorToMinor("500", "JPY")).toBe(500);
		expect(minorToMajorInput(50_000, "RUB")).toBe("500");
	});

	it("formats display values separately from persisted integers", () => {
		expect(formatMinorMoney(50_000, "RUB", "en-US")).toContain("500");
		expect(formatMajorMoney("500.00", "RUB", "en-US")).toContain("500");
		expect(formatMajorMoney("not-a-number", "RUB", "en-US")).toBe("not-a-number RUB");
	});
});
