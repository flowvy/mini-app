/**
 * App shell — floating header + scrollable content + floating tab bar + edge blur overlays.
 */
import { Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useBackButton } from "../../hooks/use-back-button.ts";
import { useScrollCompact } from "../../hooks/use-scroll-compact.ts";
import { isPrimaryTabRoute } from "../../lib/navigation-routes.ts";
import { useCurrentUser } from "../auth-guard.tsx";
import { ErrorState } from "../ui/error-state.tsx";
import styles from "./app-shell.module.css";
import { EdgeBlur } from "./edge-blur.tsx";
import { Header } from "./header.tsx";
import { TabBar } from "./tab-bar.tsx";

export function AppShell() {
	useBackButton();
	const user = useCurrentUser();
	const navigate = useNavigate();
	const location = useLocation();
	const showTabBar = isPrimaryTabRoute(location.pathname);
	const { compact, scrollRef } = useScrollCompact();
	const adminDenied = location.pathname.startsWith("/admin/") && user.role !== "admin";
	return (
		<div className={`${styles.shell} ${showTabBar ? "" : styles.withoutTabBar}`}>
			<EdgeBlur side="top" />
			<Header />
			<main ref={scrollRef} className={styles.content} data-scroll-restoration-id="main-content">
				{adminDenied ? (
					<ErrorState variant="forbidden" onAction={() => navigate({ to: "/" })} />
				) : (
					<div key={location.pathname} className={styles.routeView}>
						<Outlet />
					</div>
				)}
			</main>
			{showTabBar && <TabBar compact={compact} />}
			{showTabBar && <EdgeBlur side="bottom" />}
		</div>
	);
}
