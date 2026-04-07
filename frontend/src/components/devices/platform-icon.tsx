import type { FC } from "react";
import { useTranslation } from "react-i18next";

interface PlatformIconProps {
	platform: string | null;
	size?: number;
}

export const PlatformIcon: FC<PlatformIconProps> = ({ platform, size = 18 }) => {
	const { t } = useTranslation();
	const p = platform?.toLowerCase();
	const label =
		p === "android" || p === "ios"
			? t("devices.platform.mobile")
			: p === "macos" || p === "windows" || p === "linux"
				? t("devices.platform.desktop")
				: t("devices.platform.unknown");
	const props = {
		width: size,
		height: size,
		viewBox: "0 0 24 24",
		fill: "none",
		stroke: "currentColor",
		strokeWidth: 1.8,
		strokeLinecap: "round" as const,
		strokeLinejoin: "round" as const,
		role: "img" as const,
		"aria-label": label,
	};

	if (p === "android" || p === "ios") {
		return (
			<svg {...props}>
				<title>{label}</title>
				<rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
				<line x1="12" y1="18" x2="12.01" y2="18" />
			</svg>
		);
	}

	if (p === "macos" || p === "windows" || p === "linux") {
		return (
			<svg {...props}>
				<title>{label}</title>
				<rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
				<line x1="8" y1="21" x2="16" y2="21" />
				<line x1="12" y1="17" x2="12" y2="21" />
			</svg>
		);
	}

	return (
		<svg {...props}>
			<title>{label}</title>
			<circle cx="12" cy="12" r="10" />
			<line x1="2" y1="12" x2="22" y2="12" />
			<path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
		</svg>
	);
};
