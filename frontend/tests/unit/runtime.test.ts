import { describe, expect, it } from "vitest";
import { resolveMockAuth } from "../../src/lib/runtime.ts";

describe("runtime mode", () => {
	it("allows mock auth only in the development server", () => {
		expect(resolveMockAuth(true, "true")).toBe(true);
		expect(resolveMockAuth(true, "false")).toBe(false);
		expect(resolveMockAuth(false, "true")).toBe(false);
	});
});
