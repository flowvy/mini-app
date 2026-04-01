/**
 * AuthGuard — protects children from rendering until auth is resolved.
 * Provides current user via context to avoid redundant fetches.
 */
import { type ReactElement, type ReactNode, createContext, useContext } from "react";
import { type UserResponse, useAuth } from "../hooks/use-auth.ts";

const UserContext = createContext<UserResponse | null>(null);

export function useCurrentUser(): UserResponse {
	const user = useContext(UserContext);
	if (!user) {
		throw new Error("useCurrentUser must be used inside AuthGuard");
	}
	return user;
}

interface AuthGuardProps {
	children: ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps): ReactElement {
	const { user, isLoading, error, retry } = useAuth();

	if (isLoading) {
		return (
			<div className="fv-auth-screen">
				<p style={{ color: "var(--v2-text-secondary)" }}>Loading...</p>
			</div>
		);
	}

	if (error || !user) {
		return (
			<div className="fv-auth-screen">
				<p style={{ color: "var(--v2-text-danger, #e53935)" }}>{error || "Not authenticated"}</p>
				<button type="button" onClick={retry} className="fv-retry-btn">
					Retry
				</button>
			</div>
		);
	}

	return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}
