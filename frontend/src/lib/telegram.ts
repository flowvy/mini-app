/**
 * Initialize Telegram Mini App SDK.
 * Must be called before React renders.
 */
export function initTelegramApp(): void {
	const webApp = window.Telegram?.WebApp;
	if (!webApp) {
		return;
	}

	webApp.ready();
	webApp.expand();

	const isDark = webApp.colorScheme === "dark";
	document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
}
