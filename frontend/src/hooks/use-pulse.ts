/**
 * Pulse data hook backed by TanStack Query.
 * Fetches normalized Kuma or Beszel status from GET /api/pulse via the BFF.
 *
 * Debug mode: when VITE_MOCK_AUTH=true, fetches from
 * GET /api/debug/pulse instead.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet } from "../lib/api.ts";
import { queryKeys } from "../lib/query.ts";
import { isMockAuth } from "../lib/runtime.ts";
import type { PulseData } from "../types/pulse.ts";

interface UsePulseResult {
	pulse: PulseData | null;
	isPending: boolean;
	error: Error | null;
	refetch: () => void;
}

function fetchPulse(): Promise<PulseData> {
	if (isMockAuth) {
		return apiGet<PulseData>("/debug/pulse");
	}
	return apiGet<PulseData>("/pulse");
}

export function usePulse(): UsePulseResult {
	const queryClient = useQueryClient();
	const { data, isPending, error } = useQuery({
		queryKey: queryKeys.pulse,
		queryFn: fetchPulse,
		staleTime: 60_000,
		gcTime: 5 * 60 * 1000,
	});

	return {
		pulse: data ?? null,
		isPending,
		error: error ?? null,
		refetch: () => {
			void queryClient.invalidateQueries({ queryKey: queryKeys.pulse });
		},
	};
}
