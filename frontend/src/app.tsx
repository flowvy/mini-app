import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import type { FC } from "react";
import { AuthGuard } from "./components/auth-guard.tsx";
import { BackNavigationProvider } from "./contexts/back-navigation-context.tsx";
import { queryClient } from "./lib/query.ts";
import { router } from "./router.ts";

export const App: FC = () => {
	return (
		<QueryClientProvider client={queryClient}>
			<AuthGuard>
				<BackNavigationProvider>
					<RouterProvider router={router} />
				</BackNavigationProvider>
			</AuthGuard>
		</QueryClientProvider>
	);
};
