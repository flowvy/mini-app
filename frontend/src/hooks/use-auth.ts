/**
 * Authentication hook — fetches the current user from backend.
 */
import { useCallback, useEffect, useState } from "react";
import { apiGet } from "../lib/api.ts";

export interface UserResponse {
	id: number;
	username: string | null;
	full_name: string;
	role: string;
	is_active: boolean;
}

interface AuthState {
	user: UserResponse | null;
	isLoading: boolean;
	error: string | null;
	isAuthenticated: boolean;
}

export function useAuth(): AuthState & { retry: () => void } {
	const [user, setUser] = useState<UserResponse | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fetchUser = useCallback(async () => {
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
