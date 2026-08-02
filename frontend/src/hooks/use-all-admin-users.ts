/**
 * Fetch the full admin users list in a single request.
 * Backed by `GET /admin/users/all` (or `/debug/admin/users/all` in mock mode).
 * The whole list lives in client memory; filtering, search and sort are done in-page.
 */
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../lib/api.ts";
import { queryKeys } from "../lib/query.ts";
import { isMockAuth } from "../lib/runtime.ts";
import type { AdminUsersResponse } from "../types/admin-users.ts";

const prefix = isMockAuth ? "/debug/admin/users" : "/admin/users";

export function useAllAdminUsers() {
	return useQuery<AdminUsersResponse>({
		queryKey: queryKeys.adminUsersAll,
		queryFn: () => apiGet<AdminUsersResponse>(`${prefix}/all`),
		staleTime: 30_000,
	});
}
