import type { FC } from "react";

export const App: FC = () => {
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
			<h1
				style={{
					fontSize: "24px",
					fontWeight: 600,
					color: "var(--v2-text-primary)",
				}}
			>
				Flowvy
			</h1>
			<p
				style={{
					fontSize: "13px",
					color: "var(--v2-text-secondary)",
				}}
			>
				VPN subscription management
			</p>
		</div>
	);
};
