import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = resolve(import.meta.dirname, "../../src");
const tokensPath = resolve(sourceRoot, "styles/tokens.css");
const globalStylesPath = resolve(sourceRoot, "styles/global.css");

function sourceFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) return sourceFiles(path);
		return [".css", ".ts", ".tsx"].includes(extname(path)) ? [path] : [];
	});
}

function lineNumber(source: string, index: number): number {
	return source.slice(0, index).split("\n").length;
}

describe("global typography system", () => {
	it("defines the complete semantic type scale in one place", () => {
		const tokens = readFileSync(tokensPath, "utf8");
		expect(tokens).toContain("--font-size-overline: 10px;");
		expect(tokens).toContain("--font-size-caption: 11px;");
		expect(tokens).toContain("--font-size-label: 12px;");
		expect(tokens).toContain("--font-size-body: 13px;");
		expect(tokens).toContain("--font-size-control: var(--font-size-body);");
		expect(tokens).toContain("--font-size-heading: 15px;");
		expect(tokens).toContain("--font-size-title: 18px;");
		expect(tokens).toContain("--font-size-display: 22px;");
	});

	it("defines one global line wrapping policy", () => {
		const styles = readFileSync(globalStylesPath, "utf8");
		expect(styles).toContain("text-wrap-style: pretty;");
		expect(styles).toContain(":where(#root h1, #root h2, #root h3, #root h4)");
		expect(styles).toContain("text-wrap-style: balance;");
		expect(styles).toContain(':where(#root textarea, #root [contenteditable="true"])');
		expect(styles).toContain("text-wrap-style: stable;");
	});

	it("keeps WebKit text autosizing from inflating only selected responsive blocks", () => {
		const styles = readFileSync(globalStylesPath, "utf8");
		expect(styles).toContain("-webkit-text-size-adjust: 100%;");
		expect(styles).toContain("text-size-adjust: 100%;");
	});

	it("keeps component and page sizes on semantic tokens", () => {
		const findings: string[] = [];

		for (const path of sourceFiles(sourceRoot)) {
			if (path === tokensPath) continue;
			const source = readFileSync(path, "utf8");
			for (const match of source.matchAll(/font-size\s*:\s*([^;}]+)/g)) {
				const value = match[1]?.trim() ?? "";
				if (!/^var\(--font-size-|inherit$|^0\.92em$/.test(value)) {
					findings.push(
						`${relative(sourceRoot, path)}:${lineNumber(source, match.index)} ${match[0].trim()}`,
					);
				}
			}

			for (const match of source.matchAll(/font\s*:\s*[^;}]*\d+(?:\.\d+)?px[^;}]+/g)) {
				findings.push(
					`${relative(sourceRoot, path)}:${lineNumber(source, match.index)} ${match[0].trim()}`,
				);
			}

			for (const match of source.matchAll(/fontSize\s*:\s*\d+(?:\.\d+)?/g)) {
				findings.push(
					`${relative(sourceRoot, path)}:${lineNumber(source, match.index)} ${match[0].trim()}`,
				);
			}
		}

		expect(findings).toEqual([]);
	});
});
