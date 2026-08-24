import { describe, expect, it } from "vitest";
import { isPrimaryTabRoute } from "../../src/lib/navigation-routes.ts";

describe("isPrimaryTabRoute", () => {
	it.each([
		"/",
		"/pulse",
		"/devices",
		"/support",
		"/admin/dashboard",
		"/admin/users",
		"/admin/broadcast",
		"/admin/settings",
		"/admin/settings/",
	])("keeps tab navigation on the primary route %s", (pathname) => {
		expect(isPrimaryTabRoute(pathname)).toBe(true);
	});

	it.each([
		"/admin/users/search",
		"/admin/users/42",
		"/admin/settings/kuma",
		"/admin/settings/beszel",
		"/admin/settings/tribute",
		"/admin/settings/support",
		"/admin/settings/branding",
		"/admin/settings/welcome",
		"/admin/settings/access",
	])("removes tab navigation from the task route %s", (pathname) => {
		expect(isPrimaryTabRoute(pathname)).toBe(false);
	});
});
