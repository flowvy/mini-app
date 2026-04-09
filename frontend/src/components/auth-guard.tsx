/**
 * AuthGuard — protects children from rendering until auth is resolved.
 * Provides current user via context to avoid redundant fetches.
 */
import { type ReactElement, type ReactNode, createContext, useContext } from "react";
import { useTranslation } from "react-i18next";
import { type UserResponse, useAuth } from "../hooks/use-auth.ts";
import { SpinnerIcon } from "./ui/spinner-icon.tsx";

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
	const { t } = useTranslation();

	if (isLoading) {
		return (
			<div className="fv-auth-screen">
				<SpinnerIcon size={24} color="var(--v2-text-secondary)" />
			</div>
		);
	}

	if (error || !user) {
		return (
			<div className="fv-auth-screen">
				<p style={{ color: "var(--v2-text-danger, #e53935)" }}>
					{error || t("common.notAuthenticated")}
				</p>
				<button type="button" onClick={retry} className="fv-retry-btn">
					{t("common.retry")}
				</button>
			</div>
		);
	}

	return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}
