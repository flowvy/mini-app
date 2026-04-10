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
			<div className={`${styles.layer} ${styles.layer1}`} />
			<div className={`${styles.layer} ${styles.layer2}`} />
			<div className={`${styles.layer} ${styles.layer3}`} />
			<div className={`${styles.layer} ${styles.layer4}`} />
			<div className={`${styles.layer} ${styles.layer5}`} />
			<div className={`${styles.layer} ${styles.layer6}`} />
			<div className={`${styles.layer} ${styles.layer7}`} />
			<div className={styles.cap} />
		</div>
	);
}
