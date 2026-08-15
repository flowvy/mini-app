import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../lib/api.ts";
import { queryKeys } from "../lib/query.ts";
import { isMockAuth } from "../lib/runtime.ts";
import type { SponsorCheckout, SponsorState } from "../types/commerce.ts";

const debugTelegramId = import.meta.env.VITE_DEBUG_TELEGRAM_ID;

function sponsorPrefix(): string {
	return isMockAuth && debugTelegramId ? `/debug/sponsor/${debugTelegramId}` : "/me/sponsor";
}

export function useSponsorState() {
	return useQuery({
		queryKey: queryKeys.sponsorState,
		queryFn: () => apiGet<SponsorState>(sponsorPrefix()),
		staleTime: 0,
	});
}

export function useStartSponsorCheckout() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (offerId: string) =>
			apiPost<SponsorCheckout>(`${sponsorPrefix()}/checkouts`, { offerId }),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: queryKeys.sponsorState });
		},
	});
}
