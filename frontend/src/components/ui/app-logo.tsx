/** AppLogo — provider artwork or the token-driven built-in Flowvy mark. */
import styles from "./app-logo.module.css";

interface AppLogoProps {
	logoUrl: string | null;
	size?: number;
}

export function AppLogo({ logoUrl, size = 20 }: AppLogoProps) {
	if (logoUrl) {
		return (
			<div className={styles.logo}>
				<img src={logoUrl} height={size} width={size} alt="" />
			</div>
		);
	}

	return (
		<div className={styles.logo}>
			<svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true" focusable="false">
				<rect width="170.667" height="170.667" fill="var(--v2-icon-primary)" />
				<rect x="170.666" width="170.667" height="170.667" fill="var(--v2-icon-primary)" />
				<rect x="341.334" width="170.667" height="170.667" fill="var(--v2-icon-secondary)" />
				<rect y="170.667" width="170.667" height="170.667" fill="var(--v2-icon-primary)" />
				<rect
					x="170.666"
					y="170.667"
					width="170.667"
					height="170.667"
					fill="var(--v2-icon-secondary)"
				/>
				<rect y="341.333" width="170.667" height="170.667" fill="var(--v2-icon-primary)" />
				<rect
					x="341.334"
					y="341.333"
					width="170.667"
					height="170.667"
					fill="var(--v2-icon-positive)"
				/>
			</svg>
		</div>
	);
}
