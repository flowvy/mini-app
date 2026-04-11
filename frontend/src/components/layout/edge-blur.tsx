import styles from "./edge-blur.module.css";

interface EdgeBlurProps {
	side: "top" | "bottom";
}

export function EdgeBlur({ side }: EdgeBlurProps) {
	const containerClass =
		side === "top"
			? `${styles.container} ${styles.containerTop}`
			: `${styles.container} ${styles.containerBottom}`;

	return (
		<div className={containerClass}>
			<div className={styles.cap} />
		</div>
	);
}
