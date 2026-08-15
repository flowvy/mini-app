export type PaymentDestinationIssue = "invalid" | "https" | "credentials" | "fragment" | "tooLong";

export const PAYMENT_DESTINATION_ISSUE_KEYS: Record<PaymentDestinationIssue, string> = {
	invalid: "settings.tribute.destinations.validation.invalid",
	https: "settings.tribute.destinations.validation.https",
	credentials: "settings.tribute.destinations.validation.credentials",
	fragment: "settings.tribute.destinations.validation.fragment",
	tooLong: "settings.tribute.destinations.validation.tooLong",
};

/** Mirror the admin API's inexpensive URL checks; the backend remains authoritative. */
export function paymentDestinationIssue(value: string): PaymentDestinationIssue | null {
	const candidate = value.trim();
	if (!candidate) return null;
	if (candidate.length > 2048) return "tooLong";

	let parsed: URL;
	try {
		parsed = new URL(candidate);
	} catch {
		return "invalid";
	}
	if (parsed.protocol !== "https:") return "https";
	if (parsed.username || parsed.password) return "credentials";
	if (parsed.hash) return "fragment";
	return null;
}

export function compactPaymentDestinations(
	destinations: Record<string, string>,
): Record<string, string> {
	return Object.fromEntries(
		Object.entries(destinations)
			.map(([id, url]) => [id, url.trim()] as const)
			.filter((entry) => entry[1] !== ""),
	);
}
