/**
 * Subscription data hook backed by TanStack Query.
 * Fetches from GET /api/me/subscription (Remnawave via BFF).
 *
 * Debug mode: when VITE_MOCK_AUTH=true and VITE_DEBUG_TELEGRAM_ID is set,
 * fetches real data from GET /api/debug/subscription/{telegramId} instead.
 */
import { queryOptions, useQuery } from "@tanstack/react-query";
import { ApiError, apiGet } from "../lib/api.ts";
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

async function fetchSubscription(): Promise<SubscriptionData | null> {
	try {
		if (isMockAuth && debugTelegramId) {
			return await apiGet<SubscriptionData>(`/debug/subscription/${debugTelegramId}`);
		}
		return await apiGet<SubscriptionData>("/me/subscription");
	} catch (error) {
		if (error instanceof ApiError && error.status === 404) return null;
		throw error;
	}
}

export function subscriptionQueryOptions() {
	return queryOptions({
		queryKey: queryKeys.subscription,
		queryFn: fetchSubscription,
		staleTime: 5_000,
		gcTime: 5 * 60 * 1000,
	});
}

export function useSubscription(): UseSubscriptionResult {
	const { data, isPending, error, refetch } = useQuery(subscriptionQueryOptions());

	return {
		subscription: data ?? null,
		isPending,
		error: error ?? null,
		refetch: () => {
			void refetch();
		},
	};
}
