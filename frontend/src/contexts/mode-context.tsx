/**
 * App mode context — switches between user and admin tab sets.
 */
import { type ReactNode, createContext, useCallback, useContext, useMemo, useState } from "react";
import { useCurrentUser } from "../components/auth-guard.tsx";

export type AppMode = "user" | "admin";

interface ModeContextValue {
	mode: AppMode;
	setMode: (mode: AppMode) => void;
}

const ModeContext = createContext<ModeContextValue | null>(null);

export function useMode(): ModeContextValue {
	const ctx = useContext(ModeContext);
	if (!ctx) {
		throw new Error("useMode must be used inside ModeProvider");
	}
	return ctx;
}

interface ModeProviderProps {
	children: ReactNode;
}

export function ModeProvider({ children }: ModeProviderProps) {
	const user = useCurrentUser();
	const [mode, setModeState] = useState<AppMode>(() =>
		user.role === "admin" && window.location.pathname.startsWith("/admin/") ? "admin" : "user",
	);

	const setMode = useCallback(
		(next: AppMode) => {
			setModeState(next === "admin" && user.role !== "admin" ? "user" : next);
		},
		[user.role],
	);

	const value = useMemo(() => ({ mode, setMode }), [mode, setMode]);

	return <ModeContext.Provider value={value}>{children}</ModeContext.Provider>;
}
