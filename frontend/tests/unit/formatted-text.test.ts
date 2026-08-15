import { describe, expect, it } from "vitest";
import { normalizeFormattedTextLink } from "../../src/lib/formatted-text.ts";

describe("formatted text links", () => {
	it("normalizes an omitted safe protocol", () => {
		expect(normalizeFormattedTextLink("example.com/support")).toBe("https://example.com/support");
	});

	it("preserves explicit http and https destinations", () => {
		expect(normalizeFormattedTextLink("http://example.com/help")).toBe("http://example.com/help");
		expect(normalizeFormattedTextLink("https://example.com/help?q=1")).toBe(
			"https://example.com/help?q=1",
		);
	});

	it("rejects empty, incomplete and executable destinations", () => {
		expect(normalizeFormattedTextLink("")).toBeNull();
		expect(normalizeFormattedTextLink("https://")).toBeNull();
		expect(normalizeFormattedTextLink("javascript:alert(1)")).toBeNull();
		expect(normalizeFormattedTextLink("data:text/html,unsafe")).toBeNull();
	});
});
