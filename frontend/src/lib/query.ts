/**
 * TanStack Query client configuration and query key registry.
 */
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			retry: 1,
			refetchOnWindowFocus: false,
		},
	},
});

export const queryKeys = {
	currentUser: ["auth", "me"] as const,
	subscription: ["subscription"] as const,
	devices: ["devices"] as const,
	nodes: ["nodes"] as const,
	pulse: ["pulse"] as const,
	adminDashboard: ["admin", "dashboard"] as const,
	adminUsers: ["admin", "users", "list"] as const,
	adminUsersAll: ["admin", "users", "all"] as const,
	adminUser: (id: string) => ["admin", "users", "detail", id] as const,
	adminUsersSearch: (q: string) => ["admin", "users", "search", q] as const,
	adminSettings: ["admin", "settings"] as const,
	onboarding: ["onboarding"] as const,
	registrationSettings: ["admin", "registration", "settings"] as const,
	accessProfiles: ["admin", "registration", "access-profiles"] as const,
	registrationOptions: ["admin", "registration", "options"] as const,
	commerceRules: (provider: string) => ["admin", "commerce", "rules", provider] as const,
	commerceCatalog: (provider: string) => ["admin", "commerce", "catalog", provider] as const,
	entitlementOperations: ["admin", "commerce", "operations"] as const,
	sponsorOffers: ["admin", "commerce", "offers"] as const,
	sponsorState: ["commerce", "sponsor", "me"] as const,
	myInvite: ["registration", "my-invite"] as const,
	supportRequests: ["support", "requests"] as const,
	supportCapabilities: ["support", "capabilities"] as const,
	supportRequest: (id: string) => ["support", "requests", id] as const,
	supportArticles: ["support", "articles", "published"] as const,
	supportArticle: (id: string) => ["support", "articles", "published", id] as const,
	adminSupportArticles: ["admin", "support", "articles"] as const,
	adminSupportArticle: (id: string) => ["admin", "support", "articles", id] as const,
	adminSupportStorage: ["admin", "support", "storage"] as const,
};
