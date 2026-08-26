import { openLink, openTelegramLink } from "@tma.js/sdk-react";

/** Use Telegram's native link bridge when available and leave browser fallback to the anchor. */
export function openTelegramDestination(url: string): boolean {
	try {
		const parsed = new URL(url);
		if (parsed.protocol !== "https:" || parsed.hostname.toLowerCase() !== "t.me") return false;
		if (!openTelegramLink.isAvailable()) return false;
		openTelegramLink(url);
		return true;
	} catch {
		return false;
	}
}

/** Open a provider-hosted HTTPS checkout through Telegram's native bridge when available. */
export function openExternalDestination(url: string): boolean {
	try {
		const parsed = new URL(url);
		if (parsed.protocol !== "https:") return false;
		if (parsed.hostname.toLowerCase() === "t.me") return openTelegramDestination(url);
		if (!openLink.isAvailable()) return false;
		openLink(url);
		return true;
	} catch {
		return false;
	}
}
