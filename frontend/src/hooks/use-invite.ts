import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../lib/api.ts";
import { queryKeys } from "../lib/query.ts";
import { isMockAuth } from "../lib/runtime.ts";
import type { UserInvite } from "../types/registration.ts";

const debugTelegramId = import.meta.env.VITE_DEBUG_TELEGRAM_ID;

function fetchInvite(): Promise<UserInvite> {
	if (isMockAuth && debugTelegramId) {
		return apiGet<UserInvite>(`/debug/invite/${debugTelegramId}`);
	}
	return apiGet<UserInvite>("/me/invite");
}

export function useInvite() {
	return useQuery({
		queryKey: queryKeys.myInvite,
		queryFn: fetchInvite,
		staleTime: 30_000,
	});
}
