import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../lib/api.ts";
import { queryKeys } from "../lib/query.ts";
import type { OnboardingStatus } from "../types/registration.ts";
import type { UserResponse } from "./use-auth.ts";

export function useOnboarding() {
	const queryClient = useQueryClient();
	const statusQuery = useQuery({
		queryKey: queryKeys.onboarding,
		queryFn: () => apiGet<OnboardingStatus>("/onboarding"),
		retry: false,
	});

	const finish = (user: UserResponse) => {
		queryClient.setQueryData(queryKeys.currentUser, user);
		queryClient.removeQueries({ queryKey: queryKeys.onboarding, exact: true });
	};

	const registerMutation = useMutation({
		mutationFn: () => apiPost<UserResponse>("/onboarding/register"),
		onSuccess: finish,
	});
	const redeemMutation = useMutation({
		mutationFn: (code: string) => apiPost<UserResponse>("/onboarding/redeem", { code }),
		onSuccess: finish,
	});
	const redeemLaunchMutation = useMutation({
		mutationFn: () => apiPost<UserResponse>("/onboarding/redeem-launch"),
		onSuccess: finish,
	});

	return { statusQuery, registerMutation, redeemMutation, redeemLaunchMutation };
}
