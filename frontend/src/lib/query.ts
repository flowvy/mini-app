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
	adminStats: ["admin", "stats"] as const,
	adminUsers: (start: number) => ["admin", "users", start] as const,
	adminUsersSearch: (q: string) => ["admin", "users", "search", q] as const,
	adminSettings: ["admin", "settings"] as const,
};
