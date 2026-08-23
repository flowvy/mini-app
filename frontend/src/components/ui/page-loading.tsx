import styles from "./page-loading.module.css";
import { SpinnerIcon } from "./spinner-icon.tsx";

export function PageLoading() {
	return (
		<div className={styles.loading}>
			<SpinnerIcon size={24} color="var(--v2-text-secondary)" />
		</div>
	);
}
