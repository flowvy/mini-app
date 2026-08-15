import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPost, apiPut } from "../lib/api.ts";
import { queryKeys } from "../lib/query.ts";
import { isMockAuth } from "../lib/runtime.ts";
import type {
	CommerceCatalog,
	CommerceRule,
	CommerceRuleInput,
	CommerceRulePreview,
	EntitlementOperation,
	EntitlementOperationList,
	EntitlementOperatorActionInput,
	SponsorOffer,
	SponsorOfferInput,
} from "../types/commerce.ts";

const prefix = isMockAuth ? "/debug/admin/commerce" : "/admin/commerce";

export function useCommerceRules() {
	return useQuery({
		queryKey: queryKeys.commerceRules("tribute"),
		queryFn: () => apiGet<CommerceRule[]>(`${prefix}/rules?provider=tribute`),
	});
}

export function useCommerceCatalog() {
	return useQuery({
		queryKey: queryKeys.commerceCatalog("tribute"),
		queryFn: () => apiGet<CommerceCatalog>(`${prefix}/catalog?provider=tribute`),
		staleTime: 5 * 60 * 1000,
	});
}

export function useEntitlementOperations() {
	return useQuery({
		queryKey: queryKeys.entitlementOperations,
		queryFn: () => apiGet<EntitlementOperationList>(`${prefix}/operations?limit=20`),
	});
}

export function useSponsorOffers() {
	return useQuery({
		queryKey: queryKeys.sponsorOffers,
		queryFn: () => apiGet<SponsorOffer[]>(`${prefix}/offers`),
	});
}

export function useSaveSponsorOffer() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, input }: { id?: string; input: SponsorOfferInput }) =>
			id
				? apiPut<SponsorOffer>(`${prefix}/offers/${id}`, input)
				: apiPost<SponsorOffer>(`${prefix}/offers`, input),
		onSuccess: async () => {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: queryKeys.sponsorOffers }),
				queryClient.invalidateQueries({ queryKey: queryKeys.sponsorState }),
			]);
		},
	});
}

export function useDeleteSponsorOffer() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => apiDelete(`${prefix}/offers/${id}`),
		onSuccess: async () => {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: queryKeys.sponsorOffers }),
				queryClient.invalidateQueries({ queryKey: queryKeys.sponsorState }),
			]);
		},
	});
}

export function useActOnEntitlementOperation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, input }: { id: string; input: EntitlementOperatorActionInput }) =>
			apiPost<EntitlementOperation>(`${prefix}/operations/${id}/actions`, input),
		onSuccess: (operation) => {
			queryClient.setQueryData<EntitlementOperationList>(
				queryKeys.entitlementOperations,
				(current) =>
					current
						? {
								...current,
								operations: current.operations.map((item) =>
									item.id === operation.id ? operation : item,
								),
							}
						: current,
			);
			void queryClient.invalidateQueries({ queryKey: queryKeys.entitlementOperations });
		},
	});
}

export function useSaveCommerceRule() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, input }: { id?: string; input: CommerceRuleInput }) =>
			id
				? apiPut<CommerceRule>(`${prefix}/rules/${id}`, input)
				: apiPost<CommerceRule>(`${prefix}/rules`, input),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: queryKeys.commerceRules("tribute") });
		},
	});
}

export function useDeleteCommerceRule() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) => apiDelete(`${prefix}/rules/${id}`),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: queryKeys.commerceRules("tribute") });
		},
	});
}

export function usePreviewCommerceRule() {
	return useMutation({
		mutationFn: ({ rule, amountMinor }: { rule: CommerceRuleInput; amountMinor: number }) =>
			apiPost<CommerceRulePreview>(`${prefix}/preview`, { rule, amountMinor }),
	});
}
