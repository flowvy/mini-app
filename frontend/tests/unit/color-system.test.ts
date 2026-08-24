import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = resolve(import.meta.dirname, "../../src");
const tokensPath = resolve(sourceRoot, "styles/tokens.css");

const desktopValues: Record<string, string[]> = {
	"--v2-floor-0": ["#f2f2f2", "#171717"],
	"--v2-floor-1": ["#ffffff", "#212121"],
	"--v2-bg-primary": ["#ffffff", "#212121"],
	"--v2-bg-secondary": ["#f2f2f2", "#292929"],
	"--v2-bg-tertiary": ["#e6e6e6", "#454545"],
	"--v2-bg-quaternary": ["#424242", "#c7c7c7"],
	"--v2-bg-primary-inverted": ["#171717", "#ffffff"],
	"--v2-bg-positive-primary": ["#24784f", "#49dd93"],
	"--v2-bg-positive-secondary": ["#c6edd9", "#256042"],
	"--v2-bg-positive-tertiary": ["#e8f7f0", "#183929"],
	"--v2-bg-positive-quaternary": ["#f1faf5", "#182d22"],
	"--v2-bg-negative-primary": ["#c6352a"],
	"--v2-bg-negative-secondary": ["#feeeed", "#2d1918"],
	"--v2-bg-warning": ["#ffefcc", "#342d19"],
	"--v2-text-primary": ["#171717", "#ffffff"],
	"--v2-text-secondary": ["#454545", "#a3a3a3"],
	"--v2-text-tertiary": ["#c7c7c7", "#424242"],
	"--v2-text-primary-inverted": ["#ffffff", "#171717"],
	"--v2-text-positive": ["#24784f", "#49dd93"],
	"--v2-text-negative": ["#c6352a", "#ff554a"],
	"--v2-text-warning": ["#8a5b00", "#ffcb2f"],
	"--v2-icon-primary": ["#171717", "#ffffff"],
	"--v2-icon-secondary": ["#454545", "#a3a3a3"],
	"--v2-icon-tertiary": ["#c7c7c7", "#424242"],
	"--v2-icon-primary-inverted": ["#ffffff", "#171717"],
	"--v2-icon-positive": ["#24784f", "#49dd93"],
	"--v2-icon-negative": ["#c6352a", "#ff554a"],
	"--v2-icon-warning": ["#8a5b00", "#ffcb2f"],
	"--v2-border-primary": ["#454545", "#a3a3a3"],
	"--v2-border-secondary": ["#c7c7c7", "#424242"],
	"--v2-border-tertiary": ["#e6e6e6", "#252525"],
	"--v2-border-positive-primary": ["#24784f", "#49dd93"],
	"--v2-border-positive-secondary": ["#c6edd9", "#256042"],
	"--v2-border-negative-primary": ["#c6352a", "#ff554a"],
	"--v2-border-negative-secondary": ["#fdbdb8", "#652722"],
	"--v2-border-warning-primary": ["#8a5b00", "#ffcb2f"],
	"--v2-border-warning-secondary": ["#fcda92", "#63521d"],
	"--v2-static-white": ["#ffffff"],
	"--v2-overlay-bg": ["rgba(0, 0, 0, 0.25)", "rgba(0, 0, 0, 0.5)"],
	"--v2-gradient-positive": [
		"linear-gradient(to right, #c6edd9, #f5fcf9)",
		"linear-gradient(to right, #182d22, #18251f)",
	],
	"--v2-shadow": [
		"0 16px 48px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0, 0, 0, 0.06)",
		"0 16px 48px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.04)",
	],
	"--v2-shadow-dropdown": [
		"0 12px 40px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.08)",
		"0 12px 40px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.08)",
	],
	"--v2-shadow-tooltip": ["0 4px 12px rgba(0, 0, 0, 0.12)", "0 4px 12px rgba(0, 0, 0, 0.3)"],
	"--v2-shadow-popup": ["0 4px 24px rgba(0, 0, 0, 0.12)", "0 4px 24px rgba(0, 0, 0, 0.3)"],
	"--v2-syntax-key": ["#0550ae", "#7dcfff"],
	"--v2-syntax-string": ["#24784f", "#a9dc76"],
	"--v2-syntax-number": ["#6f42c1", "#ab9df2"],
	"--v2-syntax-bool": ["#cf222e", "#ff6188"],
};

const chromeGlassValues: Record<string, string[]> = {
	"--v2-glass-bg-bar": ["rgba(255, 255, 255, 0.92)", "rgba(33, 33, 33, 0.92)"],
	"--v2-glass-border": ["rgba(0, 0, 0, 0.08)", "rgba(255, 255, 255, 0.08)"],
	"--v2-glass-shadow-bar": ["0 1px 12px rgba(0, 0, 0, 0.08)", "0 1px 12px rgba(0, 0, 0, 0.3)"],
	"--v2-glass-highlight": [
		"inset 0 1px 0 0 rgba(255, 255, 255, 0.6), inset 0 -1px 0 0 rgba(0, 0, 0, 0.04)",
		"inset 0 1px 0 0 rgba(255, 255, 255, 0.08), inset 0 -1px 0 0 rgba(0, 0, 0, 0.2)",
	],
};

const cssNamedColors = new Set(
	`aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue
	blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson
	cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta
	darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray
	darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick
	floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey
	honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon
	lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink
	lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime
	limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen
	mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose
	moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen
	paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red
	rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue
	slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white
	whitesmoke yellow yellowgreen`.split(/\s+/),
);

function normalizeValue(value: string): string {
	return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function declarationBlock(source: string, anchor: string, selector: string): string {
	const anchorIndex = source.indexOf(anchor);
	expect(anchorIndex, anchor).toBeGreaterThanOrEqual(0);
	const selectorIndex = source.indexOf(selector, anchorIndex);
	expect(selectorIndex, selector).toBeGreaterThanOrEqual(0);
	const openBrace = source.indexOf("{", selectorIndex + selector.length - 1);
	expect(openBrace, `${anchor} ${selector}`).toBeGreaterThanOrEqual(0);

	let depth = 0;
	for (let index = openBrace; index < source.length; index += 1) {
		if (source[index] === "{") depth += 1;
		if (source[index] !== "}") continue;
		depth -= 1;
		if (depth === 0) return source.slice(openBrace + 1, index);
	}

	throw new Error(`Unclosed declaration block after ${anchor} ${selector}`);
}

function v2Declarations(source: string): Map<string, string> {
	const declarations = new Map<string, string>();
	for (const match of source.matchAll(/(--v2-[\w-]+)\s*:\s*([^;]+);/g)) {
		declarations.set(match[1], normalizeValue(match[2]));
	}
	return declarations;
}

function sourceFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) return sourceFiles(path);
		return [".css", ".ts", ".tsx", ".svg"].includes(extname(path)) ? [path] : [];
	});
}

function lineNumber(source: string, index: number): number {
	return source.slice(0, index).split("\n").length;
}

describe("desktop color parity", () => {
	it("keeps every shared color token on the frozen desktop catalog in all theme selectors", () => {
		const tokens = readFileSync(tokensPath, "utf8");
		const expected = { ...desktopValues, ...chromeGlassValues };
		const expectedTokens = Object.keys(expected).sort();
		const contexts = [
			{
				name: "system light",
				anchor: "/* ── System default: light ── */",
				selector: ":root {",
				theme: "light",
			},
			{
				name: "system dark",
				anchor: "/* ── System default: dark (before JS sets data-theme) ── */",
				selector: ":root:not([data-theme]) {",
				theme: "dark",
			},
			{
				name: "explicit dark",
				anchor: "/* ── Dark theme (explicit) ── */",
				selector: ':root[data-theme="dark"] {',
				theme: "dark",
			},
			{
				name: "explicit light",
				anchor: "/* ── Light theme (explicit) ── */",
				selector: ':root[data-theme="light"] {',
				theme: "light",
			},
		] as const;

		for (const context of contexts) {
			const declarations = v2Declarations(
				declarationBlock(tokens, context.anchor, context.selector),
			);
			expect([...declarations.keys()].sort(), context.name).toEqual(expectedTokens);

			for (const [token, values] of Object.entries(expected)) {
				const expectedValue =
					values.length === 1 || context.theme === "light" ? values[0] : values[1];
				expect(declarations.get(token), `${context.name} ${token}`).toBe(
					normalizeValue(expectedValue),
				);
			}
		}
	});

	it("keeps the approved glass exception scoped to floating Header and TabBar", () => {
		const findings: string[] = [];
		const approvedOwners = new Set([
			"components/layout/header.module.css",
			"components/layout/tab-bar.module.css",
		]);
		for (const path of sourceFiles(sourceRoot)) {
			if (path === tokensPath) continue;
			const source = readFileSync(path, "utf8");
			for (const match of source.matchAll(/var\((--v2-glass-[\w-]+)\)/g)) {
				if (!approvedOwners.has(relative(sourceRoot, path))) {
					findings.push(
						`${relative(sourceRoot, path)}:${lineNumber(source, match.index)} ${match[1]}`,
					);
				}
			}
		}
		expect(findings).toEqual([]);
	});

	it("rejects unapproved raw and derived UI colors", () => {
		const allowedSnippets: Record<string, string[]> = {
			"lib/telegram.ts": [
				'miniApp.setHeaderColor(isDark ? "#171717" : "#f2f2f2");',
				'miniApp.setBackgroundColor(isDark ? "#171717" : "#f2f2f2");',
			],
			"lib/telegram-editor-buttons.ts": [
				'readColorToken("--v2-floor-0", "#171717")',
				'readColorToken("--v2-bg-primary-inverted", "#ffffff")',
				'readColorToken("--v2-text-primary-inverted", "#171717")',
			],
		};
		const findings: string[] = [];
		const derivedKey = (path: string, line: string) => `${path}|${normalizeValue(line)}`;
		const approvedDerivedColors = new Map<string, number>([
			[
				derivedKey(
					"components/home/hero-card.tsx",
					`"linear-gradient(90deg, var(--v2-bg-positive-primary), color-mix(in srgb, var(--v2-bg-positive-primary) 70%, transparent))",`,
				),
				1,
			],
			[
				derivedKey(
					"components/admin/admin-user-hero.tsx",
					`"linear-gradient(90deg, var(--v2-bg-positive-primary), color-mix(in srgb, var(--v2-bg-positive-primary) 70%, transparent))",`,
				),
				1,
			],
			[
				derivedKey(
					"components/home/hero-card.module.css",
					"border-top: 1px solid color-mix(in srgb, var(--v2-border-secondary) 60%, transparent);",
				),
				2,
			],
			[
				derivedKey(
					"components/home/hero-card.module.css",
					"border-left: 1px solid color-mix(in srgb, var(--v2-border-secondary) 60%, transparent);",
				),
				1,
			],
			[
				derivedKey(
					"components/admin/admin-user-hero.module.css",
					"border-top: 1px solid color-mix(in srgb, var(--v2-border-secondary) 60%, transparent);",
				),
				2,
			],
			[
				derivedKey(
					"components/admin/admin-user-hero.module.css",
					"border-left: 1px solid color-mix(in srgb, var(--v2-border-secondary) 60%, transparent);",
				),
				1,
			],
			[
				derivedKey(
					"components/ui/form-section.module.css",
					"background: color-mix(in srgb, var(--v2-bg-tertiary) 50%, transparent);",
				),
				1,
			],
			[
				derivedKey(
					"components/ui/form-section.module.css",
					"border: 1px solid color-mix(in srgb, var(--v2-border-secondary) 60%, transparent);",
				),
				2,
			],
			[
				derivedKey(
					"components/content/formatted-text-editor.module.css",
					"border: 1px solid color-mix(in srgb, var(--v2-border-secondary) 60%, transparent);",
				),
				1,
			],
			[
				derivedKey(
					"components/onboarding-screen.module.css",
					"border: 1px solid color-mix(in srgb, var(--v2-border-secondary) 60%, transparent);",
				),
				1,
			],
			[
				derivedKey(
					"components/admin/settings-surface.module.css",
					"background: color-mix(in srgb, var(--v2-bg-tertiary) 50%, transparent);",
				),
				2,
			],
			[
				derivedKey(
					"components/admin/commerce-rule-editor.module.css",
					"background: color-mix(in srgb, var(--v2-bg-tertiary) 50%, transparent);",
				),
				2,
			],
			[
				derivedKey(
					"components/admin/access-profile-editor.module.css",
					"background: color-mix(in srgb, var(--v2-bg-tertiary) 50%, transparent);",
				),
				1,
			],
		]);
		const actualDerivedColors = new Map<string, number>();
		const colorPattern =
			/#[\da-fA-F]{8}\b|#[\da-fA-F]{6}\b|#[\da-fA-F]{4}\b|#[\da-fA-F]{3}\b|(?<![\w-])(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color|device-cmyk)\([^)]*\)/gi;
		const cssColorDeclarationPattern =
			/^\s*(?:accent-color|background(?:-color)?|border(?:-(?:block|inline|top|right|bottom|left)(?:-(?:start|end))?)?(?:-color)?|box-shadow|caret-color|color|fill|flood-color|lighting-color|outline(?:-color)?|stop-color|stroke|text-decoration-color|text-emphasis-color|text-shadow)\s*:\s*([^;]+);/gim;
		const inlineNamedColorPattern =
			/\b(?:background|backgroundColor|borderColor|color|fill|outlineColor|stroke)\s*:\s*(["'])([a-z]+)\1/gi;

		for (const path of sourceFiles(sourceRoot)) {
			if (path === tokensPath) continue;
			const relativePath = relative(sourceRoot, path);
			const source = readFileSync(path, "utf8");
			for (const line of source.split("\n")) {
				if (!line.includes("color-mix(")) continue;
				const key = derivedKey(relativePath, line);
				actualDerivedColors.set(key, (actualDerivedColors.get(key) ?? 0) + 1);
			}
			const allowedRanges = (allowedSnippets[relativePath] ?? []).map((snippet) => {
				const start = source.indexOf(snippet);
				if (start < 0 || source.indexOf(snippet, start + 1) >= 0) {
					findings.push(`${relativePath}: expected one exact fallback snippet: ${snippet}`);
					return [-1, -1] as const;
				}
				return [start, start + snippet.length] as const;
			});
			for (const match of source.matchAll(colorPattern)) {
				const isAllowed = allowedRanges.some(
					([start, end]) => match.index >= start && match.index + match[0].length <= end,
				);
				if (isAllowed) continue;
				findings.push(`${relativePath}:${lineNumber(source, match.index)} ${match[0]}`);
			}
			if (extname(path) === ".css") {
				for (const declaration of source.matchAll(cssColorDeclarationPattern)) {
					const valueWithoutVariables = declaration[1].replace(/var\([^)]*\)/gi, "");
					for (const identifier of valueWithoutVariables.matchAll(/\b[a-z]+\b/gi)) {
						if (!cssNamedColors.has(identifier[0].toLowerCase())) continue;
						const index =
							declaration.index + declaration[0].indexOf(declaration[1]) + identifier.index;
						findings.push(`${relativePath}:${lineNumber(source, index)} ${identifier[0]}`);
					}
				}
			} else {
				for (const match of source.matchAll(inlineNamedColorPattern)) {
					if (!cssNamedColors.has(match[2].toLowerCase())) continue;
					findings.push(`${relativePath}:${lineNumber(source, match.index)} ${match[2]}`);
				}
			}
		}

		expect(findings).toEqual([]);
		expect(actualDerivedColors).toEqual(approvedDerivedColors);
	});
});
