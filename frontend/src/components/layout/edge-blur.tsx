import styles from "./edge-blur.module.css";

interface EdgeBlurProps {
	side: "top" | "bottom";
	hidden?: boolean;
}

export function EdgeBlur({ side, hidden = false }: EdgeBlurProps) {
	const containerClass =
		side === "top"
			? `${styles.container} ${styles.containerTop}`
			: `${styles.container} ${styles.containerBottom}`;

	return (
		<div className={`${containerClass} ${hidden ? styles.hidden : ""}`} aria-hidden="true">
			<div className={styles.cap} />
		</div>
	);
}
