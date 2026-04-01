/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_API_URL: string;
	readonly VITE_BOT_USERNAME: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}

interface TelegramWebApp {
	ready(): void;
	expand(): void;
	colorScheme: "light" | "dark";
}

interface Window {
	Telegram?: {
		WebApp: TelegramWebApp;
	};
}
