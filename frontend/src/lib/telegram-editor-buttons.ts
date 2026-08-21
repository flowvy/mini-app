import { mainButton } from "@telegram-apps/sdk-react";

export interface TelegramEditorButtonState {
	primaryText: string;
	primaryEnabled: boolean;
	primaryLoading: boolean;
	primaryVisible?: boolean;
}

interface TelegramEditorButtonHandlers {
	onPrimary: () => void;
}

type HexColor = `#${string}`;

interface TelegramEditorButtonColors {
	primaryBackground: HexColor;
	primaryText: HexColor;
}

export interface TelegramEditorButtonsController {
	update: (state: TelegramEditorButtonState) => boolean;
	destroy: () => void;
}

function methodsAreAvailable(): boolean {
	try {
		return mainButton.mount.isAvailable() && mainButton.onClick.isAvailable();
	} catch {
		return false;
	}
}

function readColorToken(name: string, fallback: HexColor): HexColor {
	if (typeof document === "undefined" || typeof getComputedStyle === "undefined") return fallback;
	const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
	return /^#[\da-f]{6}$/i.test(value) ? (value.toLowerCase() as HexColor) : fallback;
}

function blendHex(foreground: HexColor, background: HexColor, opacity: number): HexColor {
	const blendChannel = (offset: number) => {
		const foregroundChannel = Number.parseInt(foreground.slice(offset, offset + 2), 16);
		const backgroundChannel = Number.parseInt(background.slice(offset, offset + 2), 16);
		return Math.round(foregroundChannel * opacity + backgroundChannel * (1 - opacity))
			.toString(16)
			.padStart(2, "0");
	};
	return `#${blendChannel(1)}${blendChannel(3)}${blendChannel(5)}`;
}

function resolveButtonColors(state: TelegramEditorButtonState): TelegramEditorButtonColors {
	const footerBackground = readColorToken("--v2-floor-0", "#171717");
	const primaryBackground = readColorToken("--v2-bg-primary-inverted", "#ffffff");
	const primaryText = readColorToken("--v2-text-primary-inverted", "#171717");
	const primaryLooksActive = state.primaryEnabled || state.primaryLoading;

	return {
		primaryBackground: primaryLooksActive
			? primaryBackground
			: blendHex(primaryBackground, footerBackground, 0.4),
		primaryText: primaryLooksActive ? primaryText : blendHex(primaryText, footerBackground, 0.4),
	};
}

/**
 * Uses Telegram's rendered MainButton for a screen's primary action.
 * Callers keep their DOM action as the browser and older-client fallback.
 */
export function mountTelegramEditorButtons(
	state: TelegramEditorButtonState,
	handlers: TelegramEditorButtonHandlers,
): TelegramEditorButtonsController | null {
	if (!methodsAreAvailable()) return null;

	let active = true;
	let mainMounted = false;
	let removeMainClick: VoidFunction | undefined;
	let themeObserver: MutationObserver | undefined;
	let currentState = state;

	const update = (nextState: TelegramEditorButtonState): boolean => {
		if (!active) return false;
		currentState = nextState;
		try {
			const colors = resolveButtonColors(nextState);
			mainButton.setParams({
				text: nextState.primaryText,
				isEnabled: nextState.primaryEnabled,
				isLoaderVisible: nextState.primaryLoading,
				isVisible: nextState.primaryVisible ?? true,
				hasShineEffect: false,
				backgroundColor: colors.primaryBackground,
				textColor: colors.primaryText,
			});
			return true;
		} catch {
			return false;
		}
	};

	const destroy = () => {
		if (!active) return;
		active = false;
		themeObserver?.disconnect();
		try {
			removeMainClick?.();
		} catch {
			/* non-critical */
		}
		if (mainMounted) {
			try {
				mainButton.setParams({ isVisible: false, isLoaderVisible: false });
			} catch {
				/* non-critical */
			}
			try {
				mainButton.unmount();
			} catch {
				/* non-critical */
			}
		}
	};

	try {
		mainButton.mount();
		mainMounted = true;
		if (!mainButton.setParams.isAvailable()) {
			throw new Error("Telegram bottom buttons did not finish mounting");
		}
		removeMainClick = mainButton.onClick(handlers.onPrimary);
		if (!update(state)) throw new Error("Telegram bottom buttons could not be configured");
		if (typeof MutationObserver !== "undefined" && typeof document !== "undefined") {
			themeObserver = new MutationObserver(() => update(currentState));
			themeObserver.observe(document.documentElement, {
				attributes: true,
				attributeFilter: ["data-theme"],
			});
		}
		return { update, destroy };
	} catch {
		destroy();
		return null;
	}
}
