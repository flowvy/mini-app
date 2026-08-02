/**
 * TanStack Query hook for admin dashboard data.
 * Debug mode: VITE_MOCK_AUTH=true → uses /api/debug/admin/dashboard.
 */
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../lib/api.ts";
import { queryKeys } from "../lib/query.ts";
import { isMockAuth } from "../lib/runtime.ts";
import type { DashboardResponse } from "../types/dashboard.ts";

const prefix = isMockAuth ? "/debug/admin/dashboard" : "/admin/dashboard";

export function useDashboard() {
	const { data, isPending, error, refetch } = useQuery<DashboardResponse>({
		queryKey: queryKeys.adminDashboard,
		queryFn: () => apiGet<DashboardResponse>(prefix),
		staleTime: 30_000,
	});

	return { data: data ?? null, isPending, error, refetch };
}
