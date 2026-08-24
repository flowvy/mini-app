import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = resolve(import.meta.dirname, "../../src");

function readSource(path: string): string {
	return readFileSync(resolve(sourceRoot, path), "utf8");
}

function declarations(source: string, selector: string): string {
	const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const match = source.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));
	expect(match, `Missing CSS rule ${selector}`).not.toBeNull();
	return match?.[1] ?? "";
}

function lastDeclarations(source: string, selector: string): string {
	const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const matches = [...source.matchAll(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, "g"))];
	expect(matches.length, `Missing CSS rule ${selector}`).toBeGreaterThan(0);
	return matches.at(-1)?.[1] ?? "";
}

describe("semantic surface roles", () => {
	it("keeps Admin Users as separate neutral ProfileCard-like surfaces", () => {
		const source = readSource("components/admin/virtualized-user-list.module.css");
		const card = declarations(source, ".card");
		const hover = declarations(source, ".card:hover");

		expect(card).toContain("background: var(--v2-bg-primary)");
		expect(card).toContain("border: 1px solid var(--v2-border-tertiary)");
		expect(card).not.toContain("box-shadow:");
		expect(hover).toContain("background: var(--v2-bg-positive-quaternary)");
	});

	it("replaces removed operation focus with the Desktop positive focus role", () => {
		const source = readSource("components/admin/commerce-activity.module.css");
		const focus = declarations(source, ".operation:focus");

		expect(focus).toContain("outline: 1.5px solid var(--v2-bg-positive-primary)");
		expect(focus).toContain("outline-offset: -2px");
	});

	it("does not use text roles to color settings and row icons", () => {
		const settings = readSource("components/admin/settings-surface.module.css");
		const userRow = readSource("components/admin/user-row.module.css");
		const platformIcon = readSource("components/devices/platform-icon.tsx");

		expect(declarations(settings, ".inlineNoticeIcon")).toContain(
			"color: var(--v2-icon-secondary)",
		);
		expect(
			declarations(settings, '.inlineNotice[data-tone="warning"] .inlineNoticeIcon'),
		).toContain("color: var(--v2-icon-warning)");
		expect(declarations(userRow, ".chevron")).toContain("color: var(--v2-icon-tertiary)");
		expect(platformIcon).toContain('fill="var(--v2-icon-warning)"');
		expect(platformIcon).not.toContain('fill="var(--v2-text-warning)"');
	});

	it("keeps every audited changed icon-only owner on the Desktop icon role catalog", () => {
		const cases = [
			["pages/admin/settings-access.module.css", ".iconButtonDanger", "--v2-icon-negative"],
			[
				"pages/admin/settings-access.module.css",
				".iconButton:hover:not(:disabled)",
				"--v2-icon-positive",
			],
			["pages/admin/users.module.css", ".clearBtn", "--v2-icon-secondary"],
			["pages/admin/users.module.css", ".emptyIcon", "--v2-icon-tertiary"],
			["pages/devices.module.css", ".emptyIcon", "--v2-icon-tertiary"],
			["components/ui/coming-soon.module.css", ".icon", "--v2-icon-secondary"],
			["components/devices/device-row.module.css", ".iconWrap", "--v2-icon-secondary"],
			["components/devices/device-row.module.css", ".iconBtn", "--v2-icon-tertiary"],
			["components/devices/device-row.module.css", ".iconBtn:hover", "--v2-icon-secondary"],
			[
				"components/home/sponsor-card.module.css",
				'.icon[data-active="true"]',
				"--v2-icon-positive",
			],
			["components/admin/commerce-rule-editor.module.css", ".removeBand", "--v2-icon-negative"],
		] as const;

		for (const [path, selector, token] of cases) {
			const rule = lastDeclarations(readSource(path), selector);
			expect(rule, `${path} ${selector}`).toContain(`color: var(${token})`);
			expect(rule, `${path} ${selector}`).not.toMatch(/color:\s*var\(--v2-text-/);
		}

		const header = readSource("components/layout/header.module.css");
		expect(declarations(header, ".userIcon")).toContain("color: var(--v2-icon-primary-inverted)");
		expect(declarations(header, ".adminIcon")).toContain("color: var(--v2-icon-positive)");

		expect(readSource("components/auth-guard.tsx")).toContain("<LaunchSkeleton />");
		expect(readSource("components/onboarding-screen.tsx")).toContain("<LaunchSkeleton />");
		expect(readSource("components/admin/content-config.tsx")).toContain(
			"<Suspense fallback={<EditorSkeleton />}>",
		);
		expect(readSource("components/admin/sponsor-offers-config.tsx")).toContain(
			"<Suspense fallback={<EditorSkeleton />}>",
		);
		expect(readSource("components/ui/page-loading.tsx")).toContain(
			"pageSkeletonVariantForPath(window.location.pathname)",
		);

		expect(
			declarations(
				readSource("components/devices/device-row.module.css"),
				".metaItem + .metaItem::before",
			),
		).toContain("color: var(--v2-text-tertiary)");
	});

	it("uses the positive text role for positive settings status labels", () => {
		const source = readSource("components/admin/settings-surface.module.css");
		const positivePill = declarations(source, '.statusPill[data-tone="positive"]');

		expect(positivePill).toContain("background: var(--v2-bg-positive-quaternary)");
		expect(positivePill).toContain("color: var(--v2-text-positive)");
	});

	it("keeps rich-text editors on the Desktop ConfigEditor hierarchy", () => {
		const formatted = readSource("components/content/formatted-text-editor.module.css");
		const telegram = readSource("components/content/telegram-html-editor.module.css");

		expect(formatted).toMatch(
			/\.editor,\s*\.editorPlaceholder\s*\{[^}]*border: 1px solid var\(--v2-border-tertiary\)[^}]*background: var\(--v2-bg-primary\)/s,
		);
		expect(declarations(formatted, ".fixedMenu")).toContain(
			"border-bottom: 1px solid var(--v2-border-tertiary)",
		);
		expect(declarations(formatted, '.toolbar button[aria-pressed="true"]')).toContain(
			"color: var(--v2-icon-positive)",
		);
		expect(declarations(formatted, ".contentEditable")).toContain(
			"caret-color: var(--v2-icon-positive)",
		);
		expect(declarations(telegram, ".editor")).toContain("background: var(--v2-bg-primary)");
		expect(declarations(telegram, ".menu")).toContain(
			"border-bottom: 1px solid var(--v2-border-tertiary)",
		);
		expect(declarations(telegram, '.toolbar button[aria-expanded="true"]')).toContain(
			"color: var(--v2-icon-positive)",
		);
	});

	it("uses secondary semantic borders for persistent inline feedback cards", () => {
		const source = readSource("components/ui/inline-feedback.module.css");

		expect(declarations(source, ".success")).toContain(
			"border: 1px solid var(--v2-border-positive-secondary)",
		);
		expect(declarations(source, ".success")).toContain(
			"background: var(--v2-bg-positive-quaternary)",
		);
		expect(declarations(source, ".error")).toContain(
			"border: 1px solid var(--v2-border-negative-secondary)",
		);
		expect(declarations(source, ".warning")).toContain(
			"border: 1px solid var(--v2-border-warning-secondary)",
		);
	});
});
