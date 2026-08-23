import { describe, expect, it } from "vitest";
import { pageSkeletonVariantForPath } from "../../src/components/ui/page-skeleton.tsx";

describe("page skeleton route families", () => {
	it.each([
		["/", "home"],
		["/pulse", "status"],
		["/devices", "devices"],
		["/admin/dashboard", "dashboard"],
		["/admin/users", "list"],
		["/admin/users/search", "list"],
		["/admin/users/42", "detail"],
		["/admin/settings", "settings"],
		["/admin/settings/tribute/payment-links", "settings"],
		["/support", "generic"],
		["/admin/broadcast", "generic"],
	] as const)("maps %s to the %s family", (pathname, variant) => {
		expect(pageSkeletonVariantForPath(pathname)).toBe(variant);
	});
});
