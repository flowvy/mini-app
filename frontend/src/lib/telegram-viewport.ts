interface TelegramDesktopViewport {
	platform: string | undefined;
	isFullscreen: boolean;
	canExitFullscreen: boolean;
	exitFullscreen: () => PromiseLike<unknown>;
}

const MOBILE_PLATFORMS = new Set(["android", "android_x", "ios"]);

export interface TelegramViewportStartupPolicy {
	expand: boolean;
	requestFullscreen: boolean;
}

/** Keep the existing mobile behavior while avoiding no-op viewport commands in Telegram Desktop. */
export function resolveTelegramViewportStartup(
	platform: string | undefined,
): TelegramViewportStartupPolicy {
	if (platform === "tdesktop") {
		return { expand: false, requestFullscreen: false };
	}
	return {
		expand: true,
		requestFullscreen: platform !== undefined && MOBILE_PLATFORMS.has(platform),
	};
}

/**
 * Keep Telegram Desktop in its movable windowed panel when it launches fullscreen.
 *
 * Telegram Desktop issue #30963 documents a Windows multi-monitor bug where a fullscreen
 * Mini App is resized but not moved to the screen origin. The Mini Apps API cannot set native
 * window coordinates, so the documented recovery available to the app is exitFullscreen().
 */
export function restoreWindowedTelegramDesktopViewport({
	platform,
	isFullscreen,
	canExitFullscreen,
	exitFullscreen,
}: TelegramDesktopViewport): boolean {
	if (platform !== "tdesktop" || !isFullscreen || !canExitFullscreen) {
		return false;
	}

	try {
		void Promise.resolve(exitFullscreen()).catch(() => undefined);
		return true;
	} catch {
		return false;
	}
}
