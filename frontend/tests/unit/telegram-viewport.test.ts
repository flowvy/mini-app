import { describe, expect, it, vi } from "vitest";
import {
	resolveTelegramViewportStartup,
	restoreWindowedTelegramDesktopViewport,
} from "../../src/lib/telegram-viewport.ts";

describe("Telegram viewport startup", () => {
	it("does not request viewport changes from Telegram Desktop", () => {
		expect(resolveTelegramViewportStartup("tdesktop")).toEqual({
			expand: false,
			requestFullscreen: false,
		});
	});

	it.each(["android", "android_x", "ios"])(
		"preserves the documented mobile startup for %s",
		(platform) => {
			expect(resolveTelegramViewportStartup(platform)).toEqual({
				expand: true,
				requestFullscreen: true,
			});
		},
	);

	it("expands without fullscreen on other supported hosts", () => {
		expect(resolveTelegramViewportStartup("web")).toEqual({
			expand: true,
			requestFullscreen: false,
		});
	});

	it("exits an active Telegram Desktop fullscreen session", () => {
		const exitFullscreen = vi.fn().mockResolvedValue(undefined);

		expect(
			restoreWindowedTelegramDesktopViewport({
				platform: "tdesktop",
				isFullscreen: true,
				canExitFullscreen: true,
				exitFullscreen,
			}),
		).toBe(true);
		expect(exitFullscreen).toHaveBeenCalledOnce();
	});

	it.each([
		["tdesktop", false, true],
		["tdesktop", true, false],
		["android", true, true],
		["ios", true, true],
		["web", true, true],
		[undefined, true, true],
	])(
		"does not change fullscreen for platform=%s, fullscreen=%s, available=%s",
		(platform, isFullscreen, canExitFullscreen) => {
			const exitFullscreen = vi.fn().mockResolvedValue(undefined);

			expect(
				restoreWindowedTelegramDesktopViewport({
					platform,
					isFullscreen,
					canExitFullscreen,
					exitFullscreen,
				}),
			).toBe(false);
			expect(exitFullscreen).not.toHaveBeenCalled();
		},
	);

	it("fails closed when the SDK command throws synchronously", () => {
		const exitFullscreen = vi.fn(() => {
			throw new Error("unsupported");
		});

		expect(
			restoreWindowedTelegramDesktopViewport({
				platform: "tdesktop",
				isFullscreen: true,
				canExitFullscreen: true,
				exitFullscreen,
			}),
		).toBe(false);
		expect(exitFullscreen).toHaveBeenCalledOnce();
	});
});
