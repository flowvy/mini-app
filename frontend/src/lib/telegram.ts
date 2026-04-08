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

function setTheme(isDark: boolean): void {
	document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
}

export function initTelegramApp(): void {
	if (initialized) {
		return;
	}
	initialized = true;

	try {
		init();

		if (themeParams.mount.isAvailable()) {
			themeParams.mount();
			if (themeParams.bindCssVars.isAvailable()) {
				themeParams.bindCssVars();
			}
		}

		if (miniApp.mount.isAvailable()) {
			miniApp.mount();
		}

		setTheme(miniApp.isDark());
		miniApp.isDark.sub(setTheme);

		miniApp.ready();

		if (viewport.mount.isAvailable()) {
			viewport.mount();
			void viewport.expand();
		}
		if (viewport.requestFullscreen.isAvailable()) {
			void viewport.requestFullscreen();
		}
	} catch {
		// Outside Telegram — dev mode, default to dark theme
		setTheme(true);
	}
}

export function getRawInitData(): string | undefined {
	try {
		return retrieveRawInitData();
	} catch {
		return undefined;
	}
}
