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
	subscription: ["subscription"] as const,
	devices: ["devices"] as const,
	nodes: ["nodes"] as const,
	pulse: ["pulse"] as const,
	adminDashboard: ["admin", "dashboard"] as const,
	adminUsers: ["admin", "users", "list"] as const,
	adminUser: (uuid: string) => ["admin", "users", "detail", uuid] as const,
	adminUsersSearch: (q: string) => ["admin", "users", "search", q] as const,
	adminSettings: ["admin", "settings"] as const,
};
