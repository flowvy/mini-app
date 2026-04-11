import { useCallback } from "react";
import { useSwipe } from "../../hooks/use-swipe.ts";
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
	const activeIndex = options.findIndex((o) => o.key === value);

	const handleSwipeLeft = useCallback(() => {
		if (activeIndex < options.length - 1) {
			onChange(options[activeIndex + 1].key);
		}
	}, [activeIndex, options, onChange]);

	const handleSwipeRight = useCallback(() => {
		if (activeIndex > 0) {
			onChange(options[activeIndex - 1].key);
		}
	}, [activeIndex, options, onChange]);

	const { onTouchStart, onTouchEnd } = useSwipe({
		onSwipeLeft: handleSwipeLeft,
		onSwipeRight: handleSwipeRight,
	});

	return (
		<div className={styles.root} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
			<div
				className={styles.pill}
				style={{
					width: `calc((100% - 6px) / ${options.length})`,
					transform: `translateX(${activeIndex * 100}%)`,
				}}
			/>
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
