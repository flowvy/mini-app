import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "../lib/api.ts";
import { queryKeys } from "../lib/query.ts";
import { isMockAuth } from "../lib/runtime.ts";
import type {
	AccessProfile,
	AccessProfileInput,
	RegistrationOptions,
	RegistrationSettings,
} from "../types/registration.ts";

const prefix = isMockAuth ? "/debug/admin/registration" : "/admin/registration";

export function useRegistrationSettings() {
	return useQuery({
		queryKey: queryKeys.registrationSettings,
		queryFn: () => apiGet<RegistrationSettings>(prefix),
	});
}

export function useRegistrationAdmin() {
	const settings = useRegistrationSettings();
	const profiles = useQuery({
		queryKey: queryKeys.accessProfiles,
		queryFn: () => apiGet<AccessProfile[]>(`${prefix}/access-profiles`),
	});
	const options = useQuery({
		queryKey: queryKeys.registrationOptions,
		queryFn: () => apiGet<RegistrationOptions>(`${prefix}/options`),
		retry: false,
	});
	return { settings, profiles, options };
}

export function useUpdateRegistrationSettings() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (patch: Partial<RegistrationSettings>) =>
			apiPatch<RegistrationSettings>(prefix, patch),
		onSuccess: (data) => queryClient.setQueryData(queryKeys.registrationSettings, data),
	});
}

export function useSaveAccessProfile() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, input }: { id?: string; input: AccessProfileInput }) =>
			id
				? apiPut<AccessProfile>(`${prefix}/access-profiles/${id}`, input)
				: apiPost<AccessProfile>(`${prefix}/access-profiles`, input),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: queryKeys.accessProfiles });
		},
	});
}

export function useDeactivateAccessProfile() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => apiDelete(`${prefix}/access-profiles/${id}`),
		onSuccess: async () => {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: queryKeys.accessProfiles }),
				queryClient.invalidateQueries({ queryKey: queryKeys.registrationSettings }),
			]);
		},
	});
}
