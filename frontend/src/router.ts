/**
 * TanStack Router — code-based route definitions.
 */
import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { AppShell } from "./components/layout/app-shell.tsx";
import { AdminBroadcast } from "./pages/admin/broadcast.tsx";
import { AdminDashboard } from "./pages/admin/dashboard.tsx";
import { AdminSettings } from "./pages/admin/settings.tsx";
import { AdminUsers } from "./pages/admin/users.tsx";
import { Devices } from "./pages/devices.tsx";
import { Home } from "./pages/home.tsx";
import { Pulse } from "./pages/pulse.tsx";
import { Support } from "./pages/support.tsx";

const rootRoute = createRootRoute({
	component: AppShell,
});

const homeRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/",
	component: Home,
});

const pulseRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/pulse",
	component: Pulse,
});

const devicesRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/devices",
	component: Devices,
});

const supportRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/support",
	component: Support,
});

const adminDashboardRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/admin/dashboard",
	component: AdminDashboard,
});

const adminUsersRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/admin/users",
	component: AdminUsers,
});

const adminBroadcastRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/admin/broadcast",
	component: AdminBroadcast,
});

const adminSettingsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/admin/settings",
	component: AdminSettings,
});

const routeTree = rootRoute.addChildren([
	homeRoute,
	pulseRoute,
	devicesRoute,
	supportRoute,
	adminDashboardRoute,
	adminUsersRoute,
	adminBroadcastRoute,
	adminSettingsRoute,
]);

export const router = createRouter({
	routeTree,
	defaultPreload: "intent",
	scrollRestoration: true,
	scrollToTopSelectors: ['[data-scroll-restoration-id="main-content"]'],
	defaultViewTransition: true,
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}
