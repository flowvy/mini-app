import { RouterProvider } from "@tanstack/react-router";
import type { FC } from "react";
import { AuthGuard } from "./components/auth-guard.tsx";
import { ModeProvider } from "./contexts/mode-context.tsx";
import { router } from "./router.ts";

export const App: FC = () => {
	return (
		<AuthGuard>
			<ModeProvider>
				<RouterProvider router={router} />
			</ModeProvider>
		</AuthGuard>
	);
};
