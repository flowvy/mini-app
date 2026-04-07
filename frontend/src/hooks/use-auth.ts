/**
 * Authentication hook — fetches the current user from backend.
 * Set VITE_MOCK_AUTH=true to use a mock admin user for local UI testing.
 */
import { useCallback, useEffect, useState } from "react";
import { apiGet } from "../lib/api.ts";

export interface FeaturesData {
	pulse: boolean;
}

export interface BrandingData {
	appName: string | null;
	logoUrl: string | null;
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
	error: string | null;
	isAuthenticated: boolean;
}

const MOCK_USER: UserResponse = {
	id: 1,
	username: "dev_admin",
	full_name: "Dev Admin",
	role: "ADMIN",
	is_active: true,
	features: { pulse: true },
	branding: { appName: null, logoUrl: null },
};

const isMockAuth = import.meta.env.VITE_MOCK_AUTH === "true";

export function useAuth(): AuthState & { retry: () => void } {
	const [user, setUser] = useState<UserResponse | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fetchUser = useCallback(async () => {
		if (isMockAuth) {
			try {
				const settings = await apiGet<{
					kumaEnabled: boolean;
					appName: string | null;
					logoUrl: string | null;
				}>("/debug/admin/settings");
				setUser({
					...MOCK_USER,
					features: { pulse: settings.kumaEnabled },
					branding: { appName: settings.appName ?? null, logoUrl: settings.logoUrl ?? null },
				});
			} catch {
				setUser(MOCK_USER);
			}
			setIsLoading(false);
			return;
		}
		setIsLoading(true);
		setError(null);
		try {
			const data = await apiGet<UserResponse>("/me");
			setUser(data);
		} catch (err) {
			const message = err instanceof Error ? err.message : "Unknown error";
			setError(message);
			setUser(null);
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		void fetchUser();
	}, [fetchUser]);

	return {
		user,
		isLoading,
		error,
		isAuthenticated: user !== null,
		retry: fetchUser,
	};
}
