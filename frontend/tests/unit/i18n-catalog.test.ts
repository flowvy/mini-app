import { readFileSync, readdirSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import locale from "../../src/i18n/locales/en.json";
import russianLocale from "../../src/i18n/locales/ru.json";

const sourceRoot = resolve(import.meta.dirname, "../../src");
const localeRoot = resolve(sourceRoot, "i18n/locales");

function sourceFiles(directory: string): string[] {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) return sourceFiles(path);
		return [".ts", ".tsx"].includes(extname(path)) ? [path] : [];
	});
}

function flattenKeys(value: unknown, prefix = ""): string[] {
	if (typeof value !== "object" || value === null) return [prefix];
	return Object.entries(value).flatMap(([key, child]) =>
		flattenKeys(child, prefix ? `${prefix}.${key}` : key),
	);
}

function flattenStrings(value: unknown, prefix = ""): Array<{ key: string; value: string }> {
	if (typeof value === "string") return [{ key: prefix, value }];
	if (typeof value !== "object" || value === null) return [];
	return Object.entries(value).flatMap(([key, child]) =>
		flattenStrings(child, prefix ? `${prefix}.${key}` : key),
	);
}

function placeholders(value: string): string[] {
	return [...value.matchAll(/\{\{\s*([^}\s]+)\s*\}\}/g)].map((match) => match[1] ?? "").sort();
}

function parsedSources(): Array<{ path: string; source: ts.SourceFile }> {
	return sourceFiles(sourceRoot).map((path) => ({
		path,
		source: ts.createSourceFile(
			path,
			readFileSync(path, "utf8"),
			ts.ScriptTarget.Latest,
			true,
			path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
		),
	}));
}

function lineFor(source: ts.SourceFile, node: ts.Node): number {
	return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
}

describe("English UI copy catalog", () => {
	it("does not mislabel Remnawave/Xray access", () => {
		expect(JSON.stringify(locale)).not.toMatch(/\bVPN\b/i);
	});

	it("does not contain unused locale leaves", () => {
		const keys = new Set(flattenKeys(locale));
		const used = new Set<string>();

		for (const { source } of parsedSources()) {
			function visit(node: ts.Node): void {
				if (ts.isStringLiteralLike(node) && keys.has(node.text)) used.add(node.text);
				ts.forEachChild(node, visit);
			}
			visit(source);
		}

		const unused = [...keys].filter((key) => !used.has(key)).sort();
		expect(unused).toEqual([]);
	});

	it("keeps visible JSX text and accessibility labels in the locale catalog", () => {
		const findings: string[] = [];
		const visibleAttributes = new Set([
			"alt",
			"aria-label",
			"aria-description",
			"placeholder",
			"title",
		]);

		for (const { path, source } of parsedSources()) {
			function report(node: ts.Node, value: string): void {
				if (value.trim())
					findings.push(`${path}:${lineFor(source, node)} ${JSON.stringify(value)}`);
			}

			function visit(node: ts.Node): void {
				if (ts.isJsxText(node)) report(node, node.text);
				if (ts.isJsxAttribute(node) && visibleAttributes.has(node.name.text.toString())) {
					if (node.initializer && ts.isStringLiteral(node.initializer))
						report(node, node.initializer.text);
				}
				if (
					ts.isJsxExpression(node) &&
					node.expression &&
					ts.isStringLiteralLike(node.expression)
				) {
					report(node, node.expression.text);
				}
				ts.forEachChild(node, visit);
			}
			visit(source);
		}

		expect(findings).toEqual([]);
	});

	it("does not render raw backend messages or select raw error payloads as copy", () => {
		const findings = parsedSources()
			.filter(({ path }) => !path.endsWith(join("lib", "api.ts")))
			.flatMap(({ path, source }) => {
				const matches: string[] = [];
				function visit(node: ts.Node): void {
					if (
						ts.isPropertyAccessExpression(node) &&
						node.name.text === "message" &&
						/error/i.test(node.expression.getText(source))
					) {
						matches.push(`${path}:${lineFor(source, node)} ${node.getText(source)}`);
					}
					if (
						ts.isPropertyAccessExpression(node) &&
						node.name.text === "error" &&
						ts.isConditionalExpression(node.parent) &&
						(node.parent.whenTrue === node || node.parent.whenFalse === node)
					) {
						matches.push(`${path}:${lineFor(source, node)} ${node.getText(source)}`);
					}
					ts.forEachChild(node, visit);
				}
				visit(source);
				return matches;
			});

		expect(findings).toEqual([]);
	});
});

describe("Russian UI copy catalog", () => {
	it("keeps exact key and placeholder parity with English", () => {
		const english = flattenStrings(locale).sort((left, right) => left.key.localeCompare(right.key));
		const russian = flattenStrings(russianLocale).sort((left, right) =>
			left.key.localeCompare(right.key),
		);

		expect(russian.map(({ key }) => key)).toEqual(english.map(({ key }) => key));
		for (const [index, source] of english.entries()) {
			const translated = russian[index];
			expect(translated?.key).toBe(source.key);
			expect(placeholders(translated?.value ?? ""), source.key).toEqual(placeholders(source.value));
		}
	});

	it("keeps the accepted compact product terminology", () => {
		expect(russianLocale.common.tab).toMatchObject({
			home: "Главная",
			devices: "Устройства",
			support: "Помощь",
			users: "Юзеры",
		});
		expect(russianLocale.home.sponsor).toMatchObject({
			baseAccess: "Базовый доступ",
			sponsorAccess: "Расширенный доступ",
		});
		expect(russianLocale.home.heroCard.openLink).toBe("Инструкция по установке");
		expect(russianLocale.home.heroCard.expiresLabel).toBe("Истекает");
		expect(russianLocale.home.detail.devices).toBe("Лимит устройств");
		expect(russianLocale.access.open).toBe("Открытый");
		expect(russianLocale.access.deactivate).toBe("Удалить профиль");
		expect(russianLocale.access.internalSquads).toBe("Внутренние сквады");
		expect(russianLocale.format.relative).toMatchObject({
			minutesAgo: "{{n}} мин.",
			hoursAgo: "{{n}} ч.",
			daysAgo: "{{n}} дн.",
		});
		expect(russianLocale.format.expiryCompact.ago).toBe("{{n}} дн. назад");
		expect(russianLocale.admin.dashboard.kpi.requests).toBe("API-запросы");
		expect(russianLocale.admin.dashboard.flowvy.requests).toBe("API-запросы");
		expect(russianLocale.support.status.withSupport).toBe("В Помощи");
		expect(locale.home.sponsor.sponsorAccess).toBe("Extended access");
		expect(locale.access.deactivate).toBe("Delete profile");
		expect(locale.admin.dashboard.kpi.requests).toBe("API requests");
		expect(locale.admin.dashboard.flowvy.requests).toBe("API requests");
	});
});

describe("Locale UI punctuation", () => {
	it("does not end compact interface copy with a period", () => {
		const findings = readdirSync(localeRoot)
			.filter((file) => extname(file) === ".json")
			.flatMap((file) => {
				const catalog: unknown = JSON.parse(readFileSync(join(localeRoot, file), "utf8"));
				return flattenStrings(catalog)
					.filter(({ value }) => {
						const compact = value.trim();
						return (
							/(?<!\.)\.$/u.test(compact) &&
							!/(?:^|\s)(?:Вкл|Выкл|мин|ч|дн|мес|шт)\.$/u.test(compact)
						);
					})
					.map(({ key, value }) => `${file}:${key} ${JSON.stringify(value)}`);
			});

		expect(findings).toEqual([]);
	});
});
