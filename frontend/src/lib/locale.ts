export function selectSupportedLocale(
	requested: readonly string[],
	supported: readonly string[],
	fallback = "en",
): string {
	for (const rawLocale of requested) {
		const locale = rawLocale.trim().replaceAll("_", "-").toLowerCase();
		const exact = supported.find((candidate) => candidate.toLowerCase() === locale);
		if (exact) return exact;
		const base = locale.split("-")[0];
		const baseMatch = supported.find((candidate) => candidate.toLowerCase() === base);
		if (baseMatch) return baseMatch;
	}
	return supported.includes(fallback) ? fallback : (supported[0] ?? fallback);
}

export function selectInitialLocale(
	telegramLocale: string | undefined,
	browserLocales: readonly string[],
	supported: readonly string[],
	fallback = "en",
): string {
	if (telegramLocale?.trim()) {
		return selectSupportedLocale([telegramLocale], supported, fallback);
	}
	return selectSupportedLocale(browserLocales, supported, fallback);
}
