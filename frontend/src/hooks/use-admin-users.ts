/**
 * TanStack Query hooks for admin users list and search.
 * Debug mode: VITE_MOCK_AUTH=true → uses /api/debug/admin/users.
 */
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../lib/api.ts";
import { queryKeys } from "../lib/query.ts";
import type { AdminUsersResponse } from "../types/admin-users.ts";

const isMockAuth = import.meta.env.VITE_MOCK_AUTH === "true";
const prefix = isMockAuth ? "/debug/admin/users" : "/admin/users";

export function useAdminUsers(size: number, start: number) {
	const { data, isPending, error } = useQuery<AdminUsersResponse>({
		queryKey: queryKeys.adminUsers(start),
		queryFn: () => apiGet<AdminUsersResponse>(`${prefix}?size=${size}&start=${start}`),
		staleTime: 0,
	});

	return { data: data ?? null, isPending, error };
}

export function useSearchUser(query: string) {
	const { data, isPending, error } = useQuery<AdminUsersResponse>({
		queryKey: queryKeys.adminUsersSearch(query),
		queryFn: () => apiGet<AdminUsersResponse>(`${prefix}/search?q=${encodeURIComponent(query)}`),
		enabled: query.length > 0,
		staleTime: 0,
	});

	return { data: data ?? null, isPending, error };
}
