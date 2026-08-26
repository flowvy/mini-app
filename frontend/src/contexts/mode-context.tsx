import { useLocation } from "@tanstack/react-router";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
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
	const location = useLocation();
	const [mode, setModeState] = useState<AppMode>(() =>
		user.role === "admin" && window.location.pathname.startsWith("/admin/") ? "admin" : "user",
	);

	useEffect(() => {
		setModeState(
			user.role === "admin" && location.pathname.startsWith("/admin/") ? "admin" : "user",
		);
	}, [location.pathname, user.role]);

	const setMode = useCallback(
		(next: AppMode) => {
			setModeState(next === "admin" && user.role !== "admin" ? "user" : next);
		},
		[user.role],
	);

	const value = useMemo(() => ({ mode, setMode }), [mode, setMode]);

	return <ModeContext.Provider value={value}>{children}</ModeContext.Provider>;
}
