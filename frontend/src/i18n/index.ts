import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { selectSupportedLocale } from "../lib/locale.ts";

type LocaleModule = { default: Record<string, unknown> };

const localeModules = import.meta.glob<LocaleModule>("./locales/*.json", { eager: true });

export const SUPPORTED_LOCALES = Object.keys(localeModules)
	.map((path) => path.match(/\/([^/]+)\.json$/)?.[1])
	.filter((locale): locale is string => Boolean(locale))
	.sort();

export function localeLabel(locale: string, displayLocale: string): string {
	try {
		return new Intl.DisplayNames([displayLocale], { type: "language" }).of(locale) ?? locale;
	} catch {
		return locale.toUpperCase();
	}
}

const resources = Object.fromEntries(
	Object.entries(localeModules).map(([path, module]) => {
		const locale = path.match(/\/([^/]+)\.json$/)?.[1];
		if (!locale) throw new Error(`Invalid locale module path: ${path}`);
		return [locale, { translation: module.default }];
	}),
);

const initialLocale = selectSupportedLocale(
	typeof navigator === "undefined" ? [] : navigator.languages,
	SUPPORTED_LOCALES,
);

i18n
	.use(initReactI18next)
	.init({
		lng: initialLocale,
		fallbackLng: "en",
		supportedLngs: SUPPORTED_LOCALES,
		resources,
		interpolation: { escapeValue: false },
	})
	.then(() => {
		if (typeof document !== "undefined") {
			document.documentElement.lang = i18n.language;
			document.title = i18n.t("common.appName");
		}
	});

export default i18n;
