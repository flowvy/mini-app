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

const supportNewRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/support/new",
	validateSearch: (search: Record<string, unknown>) => ({
		topic:
			typeof search.topic === "string" &&
			["connection", "subscription", "devices", "payment", "other"].includes(search.topic)
				? (search.topic as "connection" | "subscription" | "devices" | "payment" | "other")
				: undefined,
	}),
	component: lazyRouteComponent(() => import("./pages/support.tsx"), "SupportNewRequest"),
});

const supportAnswerRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/support/answers/$articleId",
	component: lazyRouteComponent(() => import("./pages/support.tsx"), "SupportAnswerPage"),
});

const supportArticlesAdminRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/support/manage/answers",
	component: lazyRouteComponent(
		() => import("./pages/support-articles.tsx"),
		"SupportArticlesAdmin",
	),
});

const supportArticleNewRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/support/manage/answers/new",
	component: lazyRouteComponent(() => import("./pages/support-articles.tsx"), "SupportArticleNew"),
});

const supportArticleEditRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/support/manage/answers/$articleId",
	component: lazyRouteComponent(() => import("./pages/support-articles.tsx"), "SupportArticleEdit"),
});

const supportRequestRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/support/requests/$requestId",
	component: lazyRouteComponent(() => import("./pages/support.tsx"), "SupportRequestPage"),
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

const adminSettingsPulseRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/admin/settings/pulse",
	component: lazyRouteComponent(
		() => import("./pages/admin/settings-pulse.tsx"),
		"AdminPulseSettings",
	),
});

const adminSettingsSupportRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/admin/settings/support",
	component: lazyRouteComponent(
		() => import("./pages/admin/settings-support.tsx"),
		"AdminSupportSettings",
	),
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

const adminSettingsTributeConnectionRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/admin/settings/tribute/connection",
	component: lazyRouteComponent(
		() => import("./pages/admin/settings-tribute.tsx"),
		"AdminTributeConnection",
	),
});

const adminSettingsTributePaymentLinksRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/admin/settings/tribute/payment-links",
	component: lazyRouteComponent(
		() => import("./pages/admin/settings-tribute.tsx"),
		"AdminTributePaymentLinks",
	),
});

const adminSettingsTributeReferralBenefitsRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/admin/settings/tribute/referral-benefits",
	component: lazyRouteComponent(
		() => import("./pages/admin/settings-tribute.tsx"),
		"AdminTributeReferralBenefits",
	),
});

const adminSettingsTributeAutomationRulesRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/admin/settings/tribute/automation-rules",
	component: lazyRouteComponent(
		() => import("./pages/admin/settings-tribute.tsx"),
		"AdminTributeAutomationRules",
	),
});

const adminSettingsTributeSponsorOffersRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/admin/settings/tribute/sponsor-offers",
	component: lazyRouteComponent(
		() => import("./pages/admin/settings-tribute.tsx"),
		"AdminTributeSponsorOffers",
	),
});

const adminSettingsTributeActivityRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/admin/settings/tribute/activity",
	component: lazyRouteComponent(
		() => import("./pages/admin/settings-tribute.tsx"),
		"AdminTributeActivity",
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
	validateSearch: (search: Record<string, unknown>) => ({
		message: typeof search.message === "string" ? search.message : undefined,
	}),
	component: lazyRouteComponent(
		() => import("./pages/admin/settings-content.tsx"),
		"AdminContentConfig",
	),
});

const adminSettingsCommunicationRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: "/admin/settings/communication",
	component: lazyRouteComponent(
		() => import("./pages/admin/settings-communication.tsx"),
		"AdminCommunicationSettings",
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
	supportNewRoute,
	supportAnswerRoute,
	supportArticlesAdminRoute,
	supportArticleNewRoute,
	supportArticleEditRoute,
	supportRequestRoute,
	adminDashboardRoute,
	adminUsersRoute,
	adminUsersSearchRoute,
	adminUserDetailRoute,
	adminBroadcastRoute,
	adminSettingsRoute,
	adminSettingsPulseRoute,
	adminSettingsSupportRoute,
	adminSettingsKumaRoute,
	adminSettingsBeszelRoute,
	adminSettingsTributeRoute,
	adminSettingsTributeConnectionRoute,
	adminSettingsTributePaymentLinksRoute,
	adminSettingsTributeReferralBenefitsRoute,
	adminSettingsTributeAutomationRulesRoute,
	adminSettingsTributeSponsorOffersRoute,
	adminSettingsTributeActivityRoute,
	adminSettingsBrandingRoute,
	adminSettingsWelcomeRoute,
	adminSettingsContentRoute,
	adminSettingsCommunicationRoute,
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
