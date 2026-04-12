/**
 * Telegram Mini App SDK initialization.
 * Must be called before React renders.
 */
import {
	init,
	miniApp,
	retrieveLaunchParams,
	retrieveRawInitData,
	swipeBehavior,
	themeParams,
	viewport,
} from "@telegram-apps/sdk-react";

let initialized = false;

const MOBILE_PLATFORMS = new Set(["android", "android_x", "ios"]);

function isMobilePlatform(): boolean {
	try {
		const lp = retrieveLaunchParams();
		return MOBILE_PLATFORMS.has(lp.tgWebAppPlatform);
	} catch {
		return false;
	}
}

function setTheme(isDark: boolean): void {
	document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
}

function syncNativeColors(isDark: boolean): void {
	try {
		if (miniApp.setHeaderColor.isAvailable()) {
			miniApp.setHeaderColor(isDark ? "#171717" : "#f2f2f2");
		}
		if (miniApp.setBackgroundColor.isAvailable()) {
			miniApp.setBackgroundColor(isDark ? "#171717" : "#f2f2f2");
		}
	} catch {
		/* non-critical */
	}
}

export function initTelegramApp(): void {
	if (initialized) {
		return;
	}
	initialized = true;

	try {
		init();
	} catch {
		setTheme(true);
		return;
	}

	try {
		if (themeParams.mountSync.isAvailable()) {
			themeParams.mountSync();
		}
		if (themeParams.bindCssVars.isAvailable()) {
			themeParams.bindCssVars();
		}
	} catch {
		/* non-critical */
	}

	try {
		if (miniApp.mountSync.isAvailable()) {
			miniApp.mountSync();
		}
		setTheme(miniApp.isDark());
		syncNativeColors(miniApp.isDark());
		miniApp.isDark.sub((isDark) => {
			setTheme(isDark);
			syncNativeColors(isDark);
		});
		miniApp.ready();
	} catch {
		/* non-critical */
	}

	try {
		if (swipeBehavior.mount.isAvailable()) {
			swipeBehavior.mount();
			if (swipeBehavior.disableVertical.isAvailable()) {
				swipeBehavior.disableVertical();
			}
		}
	} catch {
		/* non-critical */
	}

	try {
		if (viewport.mount.isAvailable() && !viewport.isMounting()) {
			void viewport.mount().then(() => {
				if (viewport.bindCssVars.isAvailable()) {
					viewport.bindCssVars();
				}
				void viewport.expand();
				if (isMobilePlatform() && viewport.requestFullscreen.isAvailable()) {
					void viewport.requestFullscreen();
				}
			});
		}
	} catch {
		/* non-critical */
	}
}

export function getRawInitData(): string | undefined {
	try {
		return retrieveRawInitData();
	} catch {
		return undefined;
	}
}
