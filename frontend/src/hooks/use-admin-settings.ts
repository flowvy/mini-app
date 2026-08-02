/**
 * TanStack Query hooks for admin settings CRUD.
 * Debug mode: VITE_MOCK_AUTH=true → uses /api/debug/admin/settings.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPatch, apiPost } from "../lib/api.ts";
import { queryKeys } from "../lib/query.ts";
import { isMockAuth } from "../lib/runtime.ts";
import type {
	AdminSettings,
	AdminSettingsPatch,
	BeszelTestInput,
	BeszelTestResult,
	KumaTestInput,
	KumaTestResult,
} from "../types/admin-settings.ts";
import type { UserResponse } from "./use-auth.ts";

const prefix = isMockAuth ? "/debug/admin/settings" : "/admin/settings";

export function useAdminSettings() {
	const { data, isPending, error, refetch } = useQuery<AdminSettings>({
		queryKey: queryKeys.adminSettings,
		queryFn: () => apiGet<AdminSettings>(prefix),
	});

	return { settings: data ?? null, isPending, error, refetch };
}

export function useUpdateSettings() {
	const queryClient = useQueryClient();

	return useMutation<AdminSettings, Error, AdminSettingsPatch>({
		mutationFn: (patch) => apiPatch<AdminSettings>(prefix, patch),
		onSuccess: async (data, patch) => {
			queryClient.setQueryData(queryKeys.adminSettings, data);
			queryClient.setQueryData<UserResponse>(queryKeys.currentUser, (currentUser) =>
				currentUser
					? {
							...currentUser,
							features: {
								...currentUser.features,
								pulse: data.pulseProvider !== "disabled",
							},
							branding: {
								appName: data.appName,
								logoUrl: data.logoUrl,
							},
						}
					: currentUser,
			);

			const pulseChanged = ["pulseProvider", "kumaUrl", "kumaSlug", "beszelUrl"].some((key) =>
				Object.hasOwn(patch, key),
			);
			if (pulseChanged) {
				queryClient.removeQueries({ queryKey: queryKeys.pulse, exact: true });
			}

			await queryClient.invalidateQueries({ queryKey: queryKeys.currentUser, exact: true });
		},
	});
}

export function useTestKuma() {
	return useMutation<KumaTestResult, Error, KumaTestInput>({
		mutationFn: (candidate) => apiPost<KumaTestResult>(`${prefix}/kuma/test`, candidate),
	});
}

export function useTestBeszel() {
	return useMutation<BeszelTestResult, Error, BeszelTestInput>({
		mutationFn: (candidate) => apiPost<BeszelTestResult>(`${prefix}/beszel/test`, candidate),
	});
}
