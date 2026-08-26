import { useQuery } from "@tanstack/react-query";
import i18n from "../i18n";
import { apiGet } from "../lib/api.ts";
import { resolveOperatorContent } from "../lib/operator-content.ts";
import { queryKeys } from "../lib/query.ts";
import { isMockAuth } from "../lib/runtime.ts";
import type { OperatorContent } from "../types/operator-content.ts";

interface FeaturesData {
	pulse: boolean;
}

interface BrandingData {
	appName: string | null;
	logoUrl: string | null;
	content: OperatorContent;
}

export interface UserResponse {
	id: number;
	username: string | null;
	full_name: string;
	role: string;
	is_active: boolean;
	features: FeaturesData;
	branding: BrandingData;
}

interface AuthState {
	user: UserResponse | null;
	isLoading: boolean;
	error: Error | null;
	isAuthenticated: boolean;
}

const MOCK_USER: UserResponse = {
	id: 1,
	username: "dev_admin",
	full_name: "Dev Admin",
	role: "admin",
	is_active: true,
	features: { pulse: true },
	branding: {
		appName: null,
		logoUrl: null,
		content: {},
	},
};

function getMockUser(): UserResponse {
	const role = window.localStorage.getItem("flowvy:mock-role") === "user" ? "user" : "admin";
	return { ...MOCK_USER, role };
}

const fetchUser = async (): Promise<UserResponse> => {
	if (isMockAuth) {
		if (window.localStorage.getItem("flowvy:mock-auth") === "onboarding") {
			return apiGet<UserResponse>("/me");
		}
		if (window.localStorage.getItem("flowvy:mock-auth") === "unauthenticated") {
			throw new Error("Not authenticated");
		}
		const mockUser = getMockUser();
		try {
			const settings = await apiGet<{
				pulseProvider: "disabled" | "kuma" | "beszel";
				appName: string | null;
				logoUrl: string | null;
				contentLocales: Record<string, OperatorContent>;
				contentDefaultLocale: string;
			}>("/debug/admin/settings");
			return {
				...mockUser,
				features: { pulse: settings.pulseProvider !== "disabled" },
				branding: {
					appName: settings.appName ?? null,
					logoUrl: settings.logoUrl ?? null,
					content: resolveOperatorContent(
						settings.contentLocales,
						i18n.resolvedLanguage || i18n.language,
						settings.contentDefaultLocale,
					),
				},
			};
		} catch {
			return mockUser;
		}
	}
	return apiGet<UserResponse>("/me");
};

export function useAuth(): AuthState & { retry: () => void } {
	const { data, isPending, error, refetch } = useQuery({
		queryKey: queryKeys.currentUser,
		queryFn: fetchUser,
		retry: false,
		staleTime: 60_000,
	});
	const blockingError = !data && error;

	return {
		user: data ?? null,
		isLoading: isPending,
		error: blockingError instanceof Error ? blockingError : null,
		isAuthenticated: data !== undefined,
		retry: () => {
			void refetch();
		},
	};
}
