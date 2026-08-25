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
import {
	resolveTelegramViewportStartup,
	restoreWindowedTelegramDesktopViewport,
} from "./telegram-viewport.ts";

let initialized = false;
let retainedRawInitData: string | undefined;

export function getTelegramPlatform(): string | undefined {
	try {
		return retrieveLaunchParams().tgWebAppPlatform;
	} catch {
		return undefined;
	}
}

export function getTelegramUserLocale(): string | undefined {
	try {
		return retrieveLaunchParams().tgWebAppData?.user?.language_code;
	} catch {
		return undefined;
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
			void viewport
				.mount()
				.then(() => {
					if (viewport.bindCssVars.isAvailable()) {
						viewport.bindCssVars();
					}
					const platform = getTelegramPlatform();
					const startup = resolveTelegramViewportStartup(platform);
					restoreWindowedTelegramDesktopViewport({
						platform,
						isFullscreen: viewport.isFullscreen(),
						canExitFullscreen: viewport.exitFullscreen.isAvailable(),
						exitFullscreen: viewport.exitFullscreen,
					});
					if (startup.expand) {
						void viewport.expand();
					}
					if (startup.requestFullscreen && viewport.requestFullscreen.isAvailable()) {
						void viewport.requestFullscreen();
					}
				})
				.catch(() => undefined);
		}
	} catch {
		/* non-critical */
	}
}

export function getRawInitData(): string | undefined {
	if (retainedRawInitData) return retainedRawInitData;
	try {
		const rawInitData = retrieveRawInitData();
		if (rawInitData) retainedRawInitData = rawInitData;
		return rawInitData;
	} catch {
		return undefined;
	}
}
