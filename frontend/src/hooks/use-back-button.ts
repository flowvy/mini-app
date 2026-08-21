import { useLocation, useRouter } from "@tanstack/react-router";
import { backButton } from "@telegram-apps/sdk-react";
/**
 * Global Telegram BackButton hook — shows/hides based on route depth.
 * Call once in AppShell. On tab routes the button is hidden;
 * on drill-down routes it navigates back via router history.
 */
import { useEffect } from "react";
import { isPrimaryTabRoute } from "../lib/navigation-routes.ts";

export function getBackFallback(pathname: string): string {
	if (pathname.startsWith("/admin/settings/")) return "/admin/settings";
	if (pathname.startsWith("/admin/users/")) return "/admin/users";
	if (pathname.startsWith("/admin")) return "/admin/dashboard";
	return "/";
}

export function useBackButton(): void {
	const location = useLocation();
	const router = useRouter();
	const isTabRoute = isPrimaryTabRoute(location.pathname);
	const fallback = getBackFallback(location.pathname);

	useEffect(() => {
		if (isTabRoute) {
			try {
				if (backButton.hide.isAvailable()) backButton.hide();
			} catch {
				/* non-critical */
			}
			return;
		}

		const handleBack = () => {
			if (router.history.canGoBack()) {
				router.history.back();
			} else {
				void router.navigate({ to: fallback });
			}
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
	}, [isTabRoute, router, fallback]);
}
