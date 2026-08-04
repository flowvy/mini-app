import { describe, expect, it } from "vitest";
import { getBackFallback } from "../../src/hooks/use-back-button.ts";

describe("getBackFallback", () => {
	it("returns the owning tab for directly opened detail routes", () => {
		expect(getBackFallback("/admin/settings/access")).toBe("/admin/settings");
		expect(getBackFallback("/admin/settings/beszel")).toBe("/admin/settings");
		expect(getBackFallback("/admin/users/user-id")).toBe("/admin/users");
	});

	it("falls back to the root tab for other route families", () => {
		expect(getBackFallback("/admin/unknown")).toBe("/admin/dashboard");
		expect(getBackFallback("/devices/device-id")).toBe("/");
	});
});
