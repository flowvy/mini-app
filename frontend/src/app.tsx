import type { FC } from "react";
import { AuthGuard } from "./components/auth-guard.tsx";
import { Home } from "./pages/home.tsx";

export const App: FC = () => {
	return (
		<AuthGuard>
			<Home />
		</AuthGuard>
	);
};
