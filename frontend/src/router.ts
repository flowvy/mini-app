/**
 * TanStack Router — code-based route definitions.
 */
import {
	createRootRoute,
	createRoute,
	createRouter,
	lazyRouteComponent,
} from "@tanstack/react-router";
import { AppShell } from "./components/layout/app-shell.tsx";
import { PageLoading } from "./components/ui/page-loading.tsx";

const rootRoute = createRootRoute({
	component: AppShell,
});

const homeRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/",
	component: lazyRouteComponent(() => import("./pages/home.tsx"), "Home"),
});

const pulseRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/pulse",
	component: lazyRouteComponent(() => import("./pages/pulse.tsx"), "Pulse"),
});

const devicesRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/devices",
	component: lazyRouteComponent(() => import("./pages/devices.tsx"), "Devices"),
});

const supportRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/support",
	component: lazyRouteComponent(() => import("./pages/support.tsx"), "Support"),
});

const adminDashboardRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/admin/dashboard",
	component: lazyRouteComponent(() => import("./pages/admin/dashboard.tsx"), "AdminDashboard"),
});

const adminUsersRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/admin/users",
	component: lazyRouteComponent(() => import("./pages/admin/users.tsx"), "AdminUsers"),
});

const adminUsersSearchRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/admin/users/search",
	component: lazyRouteComponent(() => import("./pages/admin/users.tsx"), "AdminUsersSearch"),
});

const adminUserDetailRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/admin/users/$userId",
	component: lazyRouteComponent(
		() => import("./pages/admin/user-detail-page.tsx"),
		"AdminUserDetailPage",
	),
});

const adminBroadcastRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/admin/broadcast",
	component: lazyRouteComponent(() => import("./pages/admin/broadcast.tsx"), "AdminBroadcast"),
});

const adminSettingsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/admin/settings",
	component: lazyRouteComponent(() => import("./pages/admin/settings.tsx"), "AdminSettings"),
});

const adminSettingsKumaRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/admin/settings/kuma",
	component: lazyRouteComponent(() => import("./pages/admin/settings-kuma.tsx"), "AdminKumaConfig"),
});

const adminSettingsBeszelRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/admin/settings/beszel",
	component: lazyRouteComponent(
		() => import("./pages/admin/settings-beszel.tsx"),
		"AdminBeszelConfig",
	),
});

const adminSettingsTributeRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/admin/settings/tribute",
	component: lazyRouteComponent(
		() => import("./pages/admin/settings-tribute.tsx"),
		"AdminTributeConfig",
	),
});

const adminSettingsBrandingRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/admin/settings/branding",
	component: lazyRouteComponent(
		() => import("./pages/admin/settings-branding.tsx"),
		"AdminBrandingConfig",
	),
});

const adminSettingsWelcomeRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/admin/settings/welcome",
	component: lazyRouteComponent(
		() => import("./pages/admin/settings-welcome.tsx"),
		"AdminWelcomeConfig",
	),
});

const adminSettingsContentRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/admin/settings/content",
	component: lazyRouteComponent(
		() => import("./pages/admin/settings-content.tsx"),
		"AdminContentConfig",
	),
});

const adminSettingsAccessRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/admin/settings/access",
	component: lazyRouteComponent(
		() => import("./pages/admin/settings-access.tsx"),
		"AdminAccessSettings",
	),
});

const routeTree = rootRoute.addChildren([
	homeRoute,
	pulseRoute,
	devicesRoute,
	supportRoute,
	adminDashboardRoute,
	adminUsersRoute,
	adminUsersSearchRoute,
	adminUserDetailRoute,
	adminBroadcastRoute,
	adminSettingsRoute,
	adminSettingsKumaRoute,
	adminSettingsBeszelRoute,
	adminSettingsTributeRoute,
	adminSettingsBrandingRoute,
	adminSettingsWelcomeRoute,
	adminSettingsContentRoute,
	adminSettingsAccessRoute,
]);

export const router = createRouter({
	routeTree,
	defaultPreload: "intent",
	defaultPendingComponent: PageLoading,
	scrollRestoration: true,
	scrollToTopSelectors: ['[data-scroll-restoration-id="main-content"]'],
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}
