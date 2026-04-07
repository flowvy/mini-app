/**
 * AppLogo — displays provider logo or built-in Flowvy logo (theme-aware).
 */
import logoDark from "../../assets/logo-dark.svg";
import logoLight from "../../assets/logo-light.svg";
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
			<img src={logoDark} height={size} width={size} alt="" className={styles.dark} />
			<img src={logoLight} height={size} width={size} alt="" className={styles.light} />
		</div>
	);
}
