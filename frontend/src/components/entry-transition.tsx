import { useTranslation } from "react-i18next";
import styles from "./entry-transition.module.css";
import { AppLogo } from "./ui/app-logo.tsx";

interface EntryTransitionProps {
	appName?: string | null;
	logoUrl?: string | null;
}

export function EntryTransition({ appName, logoUrl = null }: EntryTransitionProps) {
	const { t } = useTranslation();
	const resolvedAppName = appName || t("common.appName");

	return (
		<main className={styles.screen} aria-busy="true" data-ui="entry-transition">
			<output className={styles.visuallyHidden} aria-live="polite" aria-atomic="true">
				{t("launch.loading", { appName: resolvedAppName })}
			</output>
			<section className={styles.card} aria-labelledby="entry-transition-title">
				<div className={styles.mark} aria-hidden="true">
					<AppLogo logoUrl={logoUrl} size={64} />
				</div>
				<div className={styles.copy}>
					<p className={styles.eyebrow}>{resolvedAppName}</p>
					<h1 id="entry-transition-title" className={styles.title}>
						{t("launch.title", { appName: resolvedAppName })}
					</h1>
					<p className={styles.description}>{t("launch.description")}</p>
				</div>
				<div className={styles.progress} aria-hidden="true">
					<span />
				</div>
			</section>
		</main>
	);
}
