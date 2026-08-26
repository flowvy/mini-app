import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPost } from "../lib/api.ts";
import { queryKeys } from "../lib/query.ts";
import { isMockAuth } from "../lib/runtime.ts";
import type { AdminUser } from "../types/admin-users.ts";

const prefix = isMockAuth ? "/debug/admin/users" : "/admin/users";

export function useAdminUser(id: string) {
	const { data, isPending, error, refetch } = useQuery<AdminUser>({
		queryKey: queryKeys.adminUser(id),
		queryFn: () => apiGet<AdminUser>(`${prefix}/${id}`),
		staleTime: 0,
	});

	return { data: data ?? undefined, isPending, error, refetch };
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
