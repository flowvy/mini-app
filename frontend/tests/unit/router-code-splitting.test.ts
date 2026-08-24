import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const routerSource = readFileSync(resolve(import.meta.dirname, "../../src/router.ts"), "utf8");

describe("router code splitting", () => {
	it("keeps every page behind an official lazy route boundary", () => {
		const pageImports = [...routerSource.matchAll(/import\("(\.\/pages\/[^"]+)"\)/g)].map(
			(match) => match[1],
		);

		expect(pageImports).toHaveLength(32);
		expect(new Set(pageImports)).toEqual(
			new Set([
				"./pages/home.tsx",
				"./pages/pulse.tsx",
				"./pages/devices.tsx",
				"./pages/support.tsx",
				"./pages/support-articles.tsx",
				"./pages/admin/dashboard.tsx",
				"./pages/admin/users.tsx",
				"./pages/admin/user-detail-page.tsx",
				"./pages/admin/broadcast.tsx",
				"./pages/admin/settings.tsx",
				"./pages/admin/settings-pulse.tsx",
				"./pages/admin/settings-support.tsx",
				"./pages/admin/settings-kuma.tsx",
				"./pages/admin/settings-beszel.tsx",
				"./pages/admin/settings-tribute.tsx",
				"./pages/admin/settings-branding.tsx",
				"./pages/admin/settings-welcome.tsx",
				"./pages/admin/settings-content.tsx",
				"./pages/admin/settings-communication.tsx",
				"./pages/admin/settings-access.tsx",
			]),
		);
		expect(routerSource).not.toMatch(/from "\.\/pages\//);
	});

	it("renders the shared page loader while a route chunk is pending", () => {
		expect(routerSource).toContain("defaultPendingComponent: PageLoading");
	});
});
