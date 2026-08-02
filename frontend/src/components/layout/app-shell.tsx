/**
 * App shell — floating header + scrollable content + floating tab bar + edge blur overlays.
 */
import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useBackButton } from "../../hooks/use-back-button.ts";
import { useScrollCompact } from "../../hooks/use-scroll-compact.ts";
import { useCurrentUser } from "../auth-guard.tsx";
import styles from "./app-shell.module.css";
import { EdgeBlur } from "./edge-blur.tsx";
import { Header } from "./header.tsx";
import { TabBar } from "./tab-bar.tsx";

export function AppShell() {
	useBackButton();
	const { t } = useTranslation();
	const user = useCurrentUser();
	const location = useLocation();
	const { compact, scrollRef } = useScrollCompact();
	const adminDenied = location.pathname.startsWith("/admin/") && user.role !== "admin";
	return (
		<div className={styles.shell}>
			<EdgeBlur side="top" />
			<Header />
			<main ref={scrollRef} className={styles.content} data-scroll-restoration-id="main-content">
				{adminDenied ? (
					<section className={styles.denied} role="alert">
						<h1>{t("common.accessDenied.title")}</h1>
						<p>{t("common.accessDenied.description")}</p>
						<Link to="/" className={styles.deniedLink}>
							{t("common.accessDenied.back")}
						</Link>
					</section>
				) : (
					<div key={location.pathname} className={styles.routeView}>
						<Outlet />
					</div>
				)}
			</main>
			<TabBar compact={compact} />
			<EdgeBlur side="bottom" />
		</div>
	);
}
