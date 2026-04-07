import styles from "./segmented-control.module.css";

export interface SegmentedControlOption {
	key: string;
	label: string;
}

export interface SegmentedControlProps {
	options: SegmentedControlOption[];
	value: string;
	onChange: (key: string) => void;
}

export function SegmentedControl({ options, value, onChange }: SegmentedControlProps) {
	return (
		<div className={styles.root}>
			{options.map((opt) => (
				<button
					key={opt.key}
					type="button"
					className={`${styles.btn} ${value === opt.key ? styles.active : ""}`}
					onClick={() => onChange(opt.key)}
				>
					{opt.label}
				</button>
			))}
		</div>
	);
}
