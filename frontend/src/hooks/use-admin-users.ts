/**
 * TanStack Query hooks for admin users list, search, and actions.
 * Debug mode: VITE_MOCK_AUTH=true -> uses /api/debug/admin/users.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPost } from "../lib/api.ts";
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
		enable: (uuid: string) => mutation.mutateAsync(`${prefix}/${uuid}/enable`),
	};
}

export function useDisableUser() {
	const mutation = useAdminUserAction("post");
	return {
		...mutation,
		disable: (uuid: string) => mutation.mutateAsync(`${prefix}/${uuid}/disable`),
	};
}

export function useResetTraffic() {
	const mutation = useAdminUserAction("post");
	return {
		...mutation,
		reset: (uuid: string) => mutation.mutateAsync(`${prefix}/${uuid}/reset-traffic`),
	};
}

export function useRevokeSubscription() {
	const mutation = useAdminUserAction("post");
	return {
		...mutation,
		revoke: (uuid: string) => mutation.mutateAsync(`${prefix}/${uuid}/revoke`),
	};
}

export function useDeleteUser() {
	const mutation = useAdminUserAction("delete");
	return {
		...mutation,
		remove: (uuid: string) => mutation.mutateAsync(`${prefix}/${uuid}`),
	};
}
