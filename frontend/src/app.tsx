import type { FC } from "react";
import { AuthGuard, useCurrentUser } from "./components/auth-guard.tsx";

const Home: FC = () => {
	const user = useCurrentUser();

	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				height: "100%",
				flexDirection: "column",
				gap: "8px",
			}}
		>
			<h1 style={{ fontSize: "24px", fontWeight: 600, color: "var(--v2-text-primary)" }}>Flowvy</h1>
			<p style={{ fontSize: "13px", color: "var(--v2-text-secondary)" }}>{user.full_name}</p>
			<p style={{ fontSize: "11px", color: "var(--v2-text-tertiary, var(--v2-text-secondary))" }}>
				{user.role}
			</p>
		</div>
	);
};

export const App: FC = () => {
	return (
		<AuthGuard>
			<Home />
		</AuthGuard>
	);
};
