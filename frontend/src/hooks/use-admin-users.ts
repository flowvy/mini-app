/**
 * TanStack Query hooks for admin users list, search, detail, and actions.
 * Debug mode: VITE_MOCK_AUTH=true -> uses /api/debug/admin/users.
 */
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPost } from "../lib/api.ts";
import { queryKeys } from "../lib/query.ts";
import type { AdminUser, AdminUsersResponse } from "../types/admin-users.ts";

const isMockAuth = import.meta.env.VITE_MOCK_AUTH === "true";
const prefix = isMockAuth ? "/debug/admin/users" : "/admin/users";

const PAGE_SIZE = 25;

export function useAdminUsers() {
	return useInfiniteQuery<AdminUsersResponse>({
		queryKey: queryKeys.adminUsers,
		queryFn: ({ pageParam }) =>
			apiGet<AdminUsersResponse>(`${prefix}?size=${PAGE_SIZE}&start=${pageParam}`),
		initialPageParam: 0,
		getNextPageParam: (_lastPage, allPages) => {
			const total = allPages[0]?.total ?? 0;
			const loaded = allPages.flatMap((p) => p.users).length;
			return loaded < total ? loaded : undefined;
		},
		staleTime: 0,
	});
}

export function useAdminUser(id: string) {
	const { data, isPending, error } = useQuery<AdminUser>({
		queryKey: queryKeys.adminUser(id),
		queryFn: () => apiGet<AdminUser>(`${prefix}/${id}`),
		staleTime: 0,
	});

	return { data: data ?? undefined, isPending, error };
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

function useAdminUserAction(method: "post" | "delete") {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (path: string) => (method === "delete" ? apiDelete(path) : apiPost(path)),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ["admin", "users"] });
		},
	});
}

export function useEnableUser() {
	const mutation = useAdminUserAction("post");
	return {
		...mutation,
		enable: (id: number) => mutation.mutateAsync(`${prefix}/${id}/enable`),
	};
}

export function useDisableUser() {
	const mutation = useAdminUserAction("post");
	return {
		...mutation,
		disable: (id: number) => mutation.mutateAsync(`${prefix}/${id}/disable`),
	};
}

export function useResetTraffic() {
	const mutation = useAdminUserAction("post");
	return {
		...mutation,
		reset: (id: number) => mutation.mutateAsync(`${prefix}/${id}/reset-traffic`),
	};
}

export function useRevokeSubscription() {
	const mutation = useAdminUserAction("post");
	return {
		...mutation,
		revoke: (id: number) => mutation.mutateAsync(`${prefix}/${id}/revoke`),
	};
}

export function useDeleteUser() {
	const mutation = useAdminUserAction("delete");
	return {
		...mutation,
		remove: (id: number) => mutation.mutateAsync(`${prefix}/${id}`),
	};
}
