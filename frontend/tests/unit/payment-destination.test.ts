import { describe, expect, it } from "vitest";
import {
	compactPaymentDestinations,
	paymentDestinationIssue,
} from "../../src/lib/payment-destination.ts";

describe("payment destinations", () => {
	it("accepts documented-style HTTPS Telegram and web destinations", () => {
		expect(paymentDestinationIssue("https://t.me/tribute/app?startapp=subscription_12")).toBeNull();
		expect(paymentDestinationIssue(" https://pay.example.test/subscription/12 ")).toBeNull();
	});

	it.each([
		["not a URL", "invalid"],
		["http://pay.example.test", "https"],
		["https://user:secret@pay.example.test", "credentials"],
		["https://pay.example.test/checkout#step", "fragment"],
	])("rejects unsafe destination %s", (value, issue) => {
		expect(paymentDestinationIssue(value)).toBe(issue);
	});

	it("trims entries and removes cleared mappings before persistence", () => {
		expect(
			compactPaymentDestinations({
				"12": " https://pay.example.test/subscription/12 ",
				"13": "   ",
			}),
		).toEqual({ "12": "https://pay.example.test/subscription/12" });
	});
});
