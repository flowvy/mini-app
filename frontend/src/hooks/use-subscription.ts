/**
 * Subscription data hook backed by TanStack Query.
 * Fetches from GET /api/me/subscription (Remnawave via BFF).
 *
 * Debug mode: when VITE_MOCK_AUTH=true and VITE_DEBUG_TELEGRAM_ID is set,
 * fetches real data from GET /api/debug/subscription/{telegramId} instead.
 */
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../lib/api.ts";
import { queryKeys } from "../lib/query.ts";
import { isMockAuth } from "../lib/runtime.ts";
import type { SubscriptionData } from "../types/subscription.ts";

interface UseSubscriptionResult {
	subscription: SubscriptionData | null;
	isPending: boolean;
	error: Error | null;
	refetch: () => void;
}

const debugTelegramId = import.meta.env.VITE_DEBUG_TELEGRAM_ID;

function fetchSubscription(): Promise<SubscriptionData> {
	if (isMockAuth && debugTelegramId) {
		return apiGet<SubscriptionData>(`/debug/subscription/${debugTelegramId}`);
	}
	return apiGet<SubscriptionData>("/me/subscription");
}

export function useSubscription(): UseSubscriptionResult {
	const { data, isPending, error, refetch } = useQuery({
		queryKey: queryKeys.subscription,
		queryFn: fetchSubscription,
		staleTime: 0,
		gcTime: 5 * 60 * 1000,
	});

	return {
		subscription: data ?? null,
		isPending,
		error: error ?? null,
		refetch: () => {
			void refetch();
		},
	};
}
