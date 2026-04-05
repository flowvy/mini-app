import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import type { FC } from "react";
import { AuthGuard } from "./components/auth-guard.tsx";
import { ModeProvider } from "./contexts/mode-context.tsx";
import { queryClient } from "./lib/query.ts";
import { router } from "./router.ts";

export const App: FC = () => {
	return (
		<QueryClientProvider client={queryClient}>
			<AuthGuard>
				<ModeProvider>
					<RouterProvider router={router} />
				</ModeProvider>
			</AuthGuard>
		</QueryClientProvider>
	);
};
