import { useLocation, useRouter } from "@tanstack/react-router";
import { backButton } from "@tma.js/sdk-react";
/**
 * Global Telegram BackButton hook — shows/hides based on route depth.
 * Call once in AppShell. On tab routes the button is hidden;
 * on drill-down routes it first lets the topmost overlay consume Back,
 * then navigates to the route family's semantic parent.
 */
import { useEffect } from "react";
import { useBackNavigationController } from "../contexts/back-navigation-context.tsx";
import { isPrimaryTabRoute } from "../lib/navigation-routes.ts";

export function getBackFallback(pathname: string): string {
	if (pathname.startsWith("/support/manage/answers/")) return "/support/manage/answers";
	if (pathname.startsWith("/support/")) return "/support";
	if (pathname.startsWith("/admin/settings/tribute/")) return "/admin/settings/tribute";
	if (pathname === "/admin/settings/kuma" || pathname === "/admin/settings/beszel") {
		return "/admin/settings/pulse";
	}
	if (pathname === "/admin/settings/welcome" || pathname === "/admin/settings/content") {
		return "/admin/settings/communication";
	}
	if (pathname.startsWith("/admin/settings/")) return "/admin/settings";
	if (pathname.startsWith("/admin/users/")) return "/admin/users";
	if (pathname.startsWith("/admin")) return "/admin/dashboard";
	return "/";
}

export function useBackButton(): void {
	const location = useLocation();
	const router = useRouter();
	const { consumeBack, hasBackHandler } = useBackNavigationController();
	const isTabRoute = isPrimaryTabRoute(location.pathname);
	const shouldShow = !isTabRoute || hasBackHandler;
	const fallback = getBackFallback(location.pathname);

	useEffect(() => {
		if (!shouldShow) {
			try {
				if (backButton.hide.isAvailable()) backButton.hide();
			} catch {
				/* non-critical */
			}
			return;
		}

		const handleBack = () => {
			if (consumeBack()) return;
			if (isTabRoute) return;
			void router.navigate({ to: fallback, replace: true });
		};

		try {
			if (backButton.mount.isAvailable()) backButton.mount();
			if (backButton.show.isAvailable()) backButton.show();
			backButton.onClick(handleBack);
		} catch {
			/* non-critical — outside Telegram environment */
			return;
		}

		return () => {
			try {
				backButton.offClick(handleBack);
				if (backButton.hide.isAvailable()) backButton.hide();
			} catch {
				/* non-critical */
			}
		};
	}, [consumeBack, fallback, isTabRoute, router, shouldShow]);
}
