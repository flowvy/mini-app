import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPost, apiPut } from "../lib/api.ts";
import { queryKeys } from "../lib/query.ts";
import { isMockAuth } from "../lib/runtime.ts";
import type { CommerceRule, CommerceRuleInput, CommerceRulePreview } from "../types/commerce.ts";

const prefix = isMockAuth ? "/debug/admin/commerce" : "/admin/commerce";

export function useCommerceRules() {
	return useQuery({
		queryKey: queryKeys.commerceRules("tribute"),
		queryFn: () => apiGet<CommerceRule[]>(`${prefix}/rules?provider=tribute`),
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
