import type { OperatorContent, OperatorContentLocales } from "../types/operator-content.ts";
import { selectSupportedLocale } from "./locale.ts";

const PLACEHOLDER_PATTERN = /\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g;

export function renderTemplate(value: string, context: Record<string, string>): string {
	return value.replace(PLACEHOLDER_PATTERN, (match, key: string) => context[key] ?? match);
}

function escapeCommonMarkValue(value: string): string {
	return value.replace(/[\\`*_[\]{}()#+\-.!>|~]/g, "\\$&");
}

export function renderFormattedTemplate(value: string, context: Record<string, string>): string {
	return renderTemplate(
		value,
		Object.fromEntries(
			Object.entries(context).map(([key, item]) => [key, escapeCommonMarkValue(item)]),
		),
	);
}

export function operatorText(
	content: OperatorContent | null | undefined,
	field: keyof OperatorContent,
	fallback: string,
	context: Record<string, string> = {},
): string {
	const template = content?.[field]?.trim() || fallback;
	return renderTemplate(template, context);
}

export function operatorFormattedText(
	content: OperatorContent | null | undefined,
	field: keyof OperatorContent,
	fallback: string,
	context: Record<string, string> = {},
): string {
	const template = content?.[field]?.trim() || fallback;
	return renderFormattedTemplate(template, context);
}

export function resolveOperatorContent(
	locales: OperatorContentLocales,
	requestedLocale: string,
	defaultLocale: string,
): OperatorContent {
	const locale = selectSupportedLocale([requestedLocale], Object.keys(locales), defaultLocale);
	return locales[locale] ?? {};
}
