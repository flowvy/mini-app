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
	ariaLabel?: string;
	disabled?: boolean;
}

export function SegmentedControl({
	options,
	value,
	onChange,
	ariaLabel,
	disabled = false,
}: SegmentedControlProps) {
	const activeIndex = options.findIndex((o) => o.key === value);

	const handleSwipeLeft = useCallback(() => {
		if (!disabled && activeIndex < options.length - 1) {
			onChange(options[activeIndex + 1].key);
		}
	}, [activeIndex, disabled, options, onChange]);

	const handleSwipeRight = useCallback(() => {
		if (!disabled && activeIndex > 0) {
			onChange(options[activeIndex - 1].key);
		}
	}, [activeIndex, disabled, options, onChange]);

	const { onTouchStart, onTouchEnd } = useSwipe({
		onSwipeLeft: handleSwipeLeft,
		onSwipeRight: handleSwipeRight,
	});

	return (
		<fieldset
			className={styles.root}
			aria-label={ariaLabel}
			onTouchStart={onTouchStart}
			onTouchEnd={onTouchEnd}
		>
			{options.map((opt) => (
				<button
					key={opt.key}
					type="button"
					className={`${styles.btn} ${value === opt.key ? styles.active : ""}`}
					onClick={() => onChange(opt.key)}
					aria-pressed={value === opt.key}
					disabled={disabled}
				>
					{opt.label}
				</button>
			))}
		</fieldset>
	);
}
