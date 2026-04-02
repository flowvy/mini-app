/**
 * App mode context — switches between user and admin tab sets.
 */
import { type ReactNode, createContext, useCallback, useContext, useMemo, useState } from "react";

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
	const [mode, setModeState] = useState<AppMode>("user");

	const setMode = useCallback((next: AppMode) => {
		setModeState(next);
	}, []);

	const value = useMemo(() => ({ mode, setMode }), [mode, setMode]);

	return <ModeContext.Provider value={value}>{children}</ModeContext.Provider>;
}
