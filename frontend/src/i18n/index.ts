import i18n from "i18next";
import resourcesToBackend from "i18next-resources-to-backend";
import { initReactI18next } from "react-i18next";

i18n
	.use(initReactI18next)
	.use(resourcesToBackend((lng: string) => import(`./locales/${lng}.json`)))
	.init({
		lng: "en",
		fallbackLng: "en",
		interpolation: { escapeValue: false },
	})
	.then(() => {
		if (typeof document !== "undefined") {
			document.documentElement.lang = i18n.language;
			document.title = i18n.t("common.appName");
		}
	});

export default i18n;
