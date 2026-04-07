/**
 * TanStack Query hooks for admin settings CRUD.
 * Debug mode: VITE_MOCK_AUTH=true → uses /api/debug/admin/settings.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch } from "../lib/api.ts";
import { queryKeys } from "../lib/query.ts";
import type { AdminSettings, AdminSettingsPatch, KumaTestResult } from "../types/admin-settings.ts";

const isMockAuth = import.meta.env.VITE_MOCK_AUTH === "true";
const prefix = isMockAuth ? "/debug/admin/settings" : "/admin/settings";

export function useAdminSettings() {
	const { data, isPending, error } = useQuery<AdminSettings>({
		queryKey: queryKeys.adminSettings,
		queryFn: () => apiGet<AdminSettings>(prefix),
	});

	return { settings: data ?? null, isPending, error };
}

export function useUpdateSettings() {
	const queryClient = useQueryClient();

	return useMutation<AdminSettings, Error, AdminSettingsPatch>({
		mutationFn: (patch) => apiPatch<AdminSettings>(prefix, patch),
		onSuccess: (data) => {
			queryClient.setQueryData(queryKeys.adminSettings, data);
		},
	});
}

export function useTestKuma() {
	return useMutation<KumaTestResult, Error, void>({
		mutationFn: () => apiGet<KumaTestResult>(`${prefix}/kuma/test`),
	});
}
