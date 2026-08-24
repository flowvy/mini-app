import type { Page } from "@playwright/test";

export interface TelegramMainButtonState {
	text?: string;
	is_active?: boolean;
	is_progress_visible?: boolean;
	is_visible?: boolean;
	color?: string;
	text_color?: string;
}

export interface TelegramPopupState {
	title: string;
	message: string;
	buttons: Array<{ id: string; text?: string; type?: string }>;
}

const launchParams = new URLSearchParams({
	tgWebAppPlatform: "ios",
	tgWebAppVersion: "9.6",
	tgWebAppThemeParams: JSON.stringify({
		bg_color: "#171717",
		button_color: "#31d58b",
		button_text_color: "#111111",
		bottom_bar_bg_color: "#171717",
	}),
});

export async function installTelegramMainButton(page: Page): Promise<void> {
	await page.addInitScript(() => {
		const telegramWindow = window as typeof window & {
			__telegramEvents?: Array<{ eventType: string; eventData?: string }>;
			Telegram?: {
				WebView?: {
					receiveEvent?: (event: string, data?: Record<string, unknown>) => void;
				};
			};
		};
		telegramWindow.__telegramEvents = [];
		Object.defineProperty(window, "TelegramWebviewProxy", {
			configurable: true,
			value: {
				postEvent: (eventType: string, eventData?: string) => {
					telegramWindow.__telegramEvents?.push({ eventType, eventData });
					const safeArea = { top: 0, right: 0, bottom: 0, left: 0 };
					const response =
						eventType === "web_app_request_viewport"
							? {
									name: "viewport_changed",
									data: {
										height: window.innerHeight,
										width: window.innerWidth,
										is_expanded: true,
										is_state_stable: true,
									},
								}
							: eventType === "web_app_request_safe_area"
								? { name: "safe_area_changed", data: safeArea }
								: eventType === "web_app_request_content_safe_area"
									? { name: "content_safe_area_changed", data: safeArea }
									: null;
					if (response) {
						queueMicrotask(() =>
							telegramWindow.Telegram?.WebView?.receiveEvent?.(response.name, response.data),
						);
					}
				},
			},
		});
	});
}

export async function emitTelegramViewport(
	page: Page,
	height: number,
	isStateStable: boolean,
): Promise<void> {
	await page.evaluate(
		({ nextHeight, stable }) => {
			const telegramWindow = window as typeof window & {
				Telegram?: {
					WebView?: {
						receiveEvent?: (event: string, data?: Record<string, unknown>) => void;
					};
				};
			};
			telegramWindow.Telegram?.WebView?.receiveEvent?.("viewport_changed", {
				height: nextHeight,
				width: window.innerWidth,
				is_expanded: true,
				is_state_stable: stable,
			});
		},
		{ nextHeight: height, stable: isStateStable },
	);
}

export function withTelegramMainButton(path: string): string {
	const url = new URL(path, "https://flowvy.test");
	for (const [key, value] of launchParams) url.searchParams.set(key, value);
	return `${url.pathname}${url.search}${url.hash}`;
}

export async function latestTelegramMainButton(
	page: Page,
): Promise<TelegramMainButtonState | null> {
	return page.evaluate(() => {
		const telegramWindow = window as typeof window & {
			__telegramEvents?: Array<{ eventType: string; eventData?: string }>;
		};
		const mainEvents = telegramWindow.__telegramEvents?.filter(
			(event) => event.eventType === "web_app_setup_main_button",
		);
		const eventData = mainEvents?.at(-1)?.eventData;
		return eventData ? JSON.parse(eventData) : null;
	});
}

export async function pressTelegramMainButton(page: Page): Promise<void> {
	await page.evaluate(() => {
		const telegramWindow = window as typeof window & {
			Telegram?: { WebView?: { receiveEvent?: (event: string) => void } };
		};
		telegramWindow.Telegram?.WebView?.receiveEvent?.("main_button_pressed");
	});
}

export async function telegramPopups(page: Page): Promise<TelegramPopupState[]> {
	return page.evaluate(() => {
		const telegramWindow = window as typeof window & {
			__telegramEvents?: Array<{ eventType: string; eventData?: string }>;
		};
		return (telegramWindow.__telegramEvents ?? [])
			.filter((event) => event.eventType === "web_app_open_popup" && event.eventData)
			.map((event) => JSON.parse(event.eventData as string) as TelegramPopupState);
	});
}

export async function closeTelegramPopup(
	page: Page,
	buttonId: "confirm" | "cancel" | null,
): Promise<void> {
	await page.evaluate((selectedButtonId) => {
		const telegramWindow = window as typeof window & {
			Telegram?: {
				WebView?: {
					receiveEvent?: (event: string, data?: { button_id?: string }) => void;
				};
			};
		};
		telegramWindow.Telegram?.WebView?.receiveEvent?.(
			"popup_closed",
			selectedButtonId ? { button_id: selectedButtonId } : {},
		);
	}, buttonId);
}
