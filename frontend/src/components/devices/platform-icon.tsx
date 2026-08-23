import type { FC } from "react";
import { useTranslation } from "react-i18next";

interface PlatformIconProps {
	platform: string | null;
	size?: number;
}

export type PlatformKind = "android" | "ios" | "macos" | "windows" | "linux";

export function getPlatformKind(platform: string | null): PlatformKind | null {
	const normalized = platform?.trim().toLowerCase();
	switch (normalized) {
		case "android":
		case "ios":
		case "macos":
		case "windows":
		case "linux":
			return normalized;
		default:
			return null;
	}
}

export const PlatformIcon: FC<PlatformIconProps> = ({ platform, size = 18 }) => {
	const { t } = useTranslation();
	const kind = getPlatformKind(platform);
	const label = kind ? t(`devices.platform.${kind}`) : t("devices.platform.unknown");
	const props = {
		width: size,
		height: size,
		viewBox: "0 0 24 24",
		role: "img" as const,
		"aria-label": label,
		"data-platform-logo": kind ?? "unknown",
	};

	if (kind === "android") {
		return (
			<svg {...props}>
				<title>{label}</title>
				<path
					fill="currentColor"
					d="M7.05 8.1h9.9a1.05 1.05 0 0 1 1.05 1.05v7.8A1.05 1.05 0 0 1 16.95 18H16v2.25a.75.75 0 0 1-1.5 0V18h-5v2.25a.75.75 0 0 1-1.5 0V18h-.95A1.05 1.05 0 0 1 6 16.95v-7.8A1.05 1.05 0 0 1 7.05 8.1Zm1.18-1.35a4.7 4.7 0 0 1 7.54 0H8.23Z"
				/>
				<path
					d="m8.6 3.5 1.1 1.65m5.7-1.65-1.1 1.65"
					fill="none"
					stroke="currentColor"
					strokeLinecap="round"
					strokeWidth="1.2"
				/>
				<circle cx="9.5" cy="10.7" r=".7" fill="var(--v2-bg-secondary)" />
				<circle cx="14.5" cy="10.7" r=".7" fill="var(--v2-bg-secondary)" />
			</svg>
		);
	}

	if (kind === "ios" || kind === "macos") {
		return (
			<svg {...props}>
				<title>{label}</title>
				<path
					fill="currentColor"
					d="M16.85 12.66c.02-2.03 1.66-3 1.74-3.05a3.74 3.74 0 0 0-2.94-1.6c-1.24-.13-2.45.74-3.08.74-.64 0-1.61-.73-2.65-.7a3.9 3.9 0 0 0-3.29 2c-1.42 2.46-.36 6.08 1 8.07.68.97 1.47 2.05 2.5 2.01 1-.04 1.38-.65 2.6-.65 1.2 0 1.56.65 2.6.63 1.08-.02 1.76-.98 2.41-1.96a8 8 0 0 0 1.1-2.24 3.5 3.5 0 0 1-1.99-3.25ZM14.84 6.7a3.55 3.55 0 0 0 .82-2.55 3.62 3.62 0 0 0-2.35 1.21 3.37 3.37 0 0 0-.84 2.45 3 3 0 0 0 2.37-1.11Z"
				/>
			</svg>
		);
	}

	if (kind === "windows") {
		return (
			<svg {...props}>
				<title>{label}</title>
				<path
					fill="currentColor"
					d="m2.7 4.65 8.25-1.14v7.92H2.7V4.65Zm9.35-1.3L21.3 2.08v9.35h-9.25V3.35ZM2.7 12.57h8.25v7.92L2.7 19.35v-6.78Zm9.35 0h9.25v9.35l-9.25-1.27v-8.08Z"
				/>
			</svg>
		);
	}

	if (kind === "linux") {
		return (
			<svg {...props}>
				<title>{label}</title>
				<path
					d="M12 2.4c-2.35 0-3.3 2.3-3.3 5.3 0 1.05-.44 1.9-1.18 2.95C6.55 12 5.7 13.7 5.7 16c0 3.35 2.7 5.6 6.3 5.6s6.3-2.25 6.3-5.6c0-2.3-.85-4-1.82-5.35-.74-1.05-1.18-1.9-1.18-2.95 0-3-.95-5.3-3.3-5.3Z"
					fill="currentColor"
				/>
				<ellipse cx="10.2" cy="7.2" rx="1.2" ry="1.55" fill="var(--v2-bg-secondary)" />
				<ellipse cx="13.8" cy="7.2" rx="1.2" ry="1.55" fill="var(--v2-bg-secondary)" />
				<path d="m10.2 9.15 1.8 1.15 1.8-1.15L12 8.45l-1.8.7Z" fill="var(--v2-icon-warning)" />
				<ellipse cx="12" cy="15.7" rx="3.15" ry="4.05" fill="var(--v2-bg-secondary)" />
			</svg>
		);
	}

	return (
		<svg {...props}>
			<title>{label}</title>
			<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.7" />
			<path
				d="M3 12h18M12 3c2.25 2.47 3.4 5.47 3.4 9s-1.15 6.53-3.4 9c-2.25-2.47-3.4-5.47-3.4-9S9.75 5.47 12 3Z"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.7"
			/>
		</svg>
	);
};
