const DEFAULT_FRACTION_DIGITS = 2;

export function currencyFractionDigits(currency: string): number {
	try {
		return (
			new Intl.NumberFormat("en", {
				style: "currency",
				currency: currency.toUpperCase(),
			}).resolvedOptions().maximumFractionDigits ?? DEFAULT_FRACTION_DIGITS
		);
	} catch {
		return DEFAULT_FRACTION_DIGITS;
	}
}

export function majorToMinor(value: string, currency: string): number | null {
	const normalized = value.trim().replace(",", ".");
	const fractionDigits = currencyFractionDigits(currency);
	const pattern = new RegExp(`^\\d+(?:\\.\\d{0,${fractionDigits}})?$`);
	if (!pattern.test(normalized)) return null;
	const [whole = "0", fraction = ""] = normalized.split(".");
	const scale = 10n ** BigInt(fractionDigits);
	const minor = BigInt(whole) * scale + BigInt(fraction.padEnd(fractionDigits, "0") || "0");
	return minor <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(minor) : null;
}

export function minorToMajorInput(value: number, currency: string): string {
	const fractionDigits = currencyFractionDigits(currency);
	if (fractionDigits === 0) return String(value);
	const scale = 10 ** fractionDigits;
	const whole = Math.floor(value / scale);
	const fraction = String(value % scale)
		.padStart(fractionDigits, "0")
		.replace(/0+$/, "");
	return fraction ? `${whole}.${fraction}` : String(whole);
}

export function formatMinorMoney(value: number, currency: string, locale?: string): string {
	const fractionDigits = currencyFractionDigits(currency);
	return new Intl.NumberFormat(locale, {
		style: "currency",
		currency,
		maximumFractionDigits: fractionDigits,
	}).format(value / 10 ** fractionDigits);
}

export function formatMajorMoney(value: string, currency: string, locale?: string): string {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return `${value} ${currency}`;
	const fractionDigits = currencyFractionDigits(currency);
	return new Intl.NumberFormat(locale, {
		style: "currency",
		currency,
		maximumFractionDigits: fractionDigits,
	}).format(parsed);
}
