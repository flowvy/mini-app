const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:"]);

/** Normalize a user-authored destination without allowing executable URL schemes. */
export function normalizeFormattedTextLink(value: string): string | null {
	const candidate = value.trim();
	if (!candidate) return null;
	const withProtocol = /^[a-z][a-z\d+.-]*:/i.test(candidate) ? candidate : `https://${candidate}`;
	try {
		const parsed = new URL(withProtocol);
		return SAFE_LINK_PROTOCOLS.has(parsed.protocol) && parsed.hostname ? parsed.href : null;
	} catch {
		return null;
	}
}
