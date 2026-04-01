/**
 * Telegram Mini App SDK initialization.
 * Must be called before React renders.
 */
import {
	init,
	miniApp,
	retrieveRawInitData,
	themeParams,
	viewport,
} from "@telegram-apps/sdk-react";

let initialized = false;

export function initTelegramApp(): void {
	if (initialized) {
		return;
	}
	initialized = true;

	try {
		init();

		if (miniApp.mount.isAvailable()) {
			miniApp.mount();
		}
		miniApp.ready();

		if (themeParams.mount.isAvailable()) {
			themeParams.mount();
		}

		if (viewport.mount.isAvailable()) {
			viewport.mount();
			void viewport.expand();
		}

		const isDark = miniApp.isDark();
		document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
	} catch {
		// Outside Telegram — dev mode, default to dark theme
		document.documentElement.setAttribute("data-theme", "dark");
	}
}

export function getRawInitData(): string | undefined {
	try {
		return retrieveRawInitData();
	} catch {
		return undefined;
	}
}
