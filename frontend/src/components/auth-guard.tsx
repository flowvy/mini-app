import { createContext, type ReactElement, type ReactNode, useContext, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { type UserResponse, useAuth } from "../hooks/use-auth.ts";
import { ApiError } from "../lib/api.ts";
import { getLocalizedError } from "../lib/error-copy.ts";
import { OnboardingScreen } from "./onboarding-screen.tsx";
import { ErrorState } from "./ui/error-state.tsx";
import { LaunchSkeleton } from "./ui/page-skeleton.tsx";

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

	useEffect(() => {
		document.title = user?.branding.appName || t("common.appName");
	}, [t, user?.branding.appName]);

	if (isLoading) {
		return <LaunchSkeleton />;
	}

	if (error || !user) {
		if (error instanceof ApiError && error.code === "invite_required") {
			return <OnboardingScreen initialState="invite_required" />;
		}
		if (error instanceof ApiError && error.code === "registration_required") {
			return <OnboardingScreen initialState="open" />;
		}
		return (
			<ErrorState
				variant="auth"
				description={getLocalizedError(error, "common.errorState.auth.description")}
				onAction={retry}
			/>
		);
	}

	return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}
