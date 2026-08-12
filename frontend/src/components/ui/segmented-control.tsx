import { type CSSProperties, type KeyboardEvent, useCallback, useRef } from "react";
import { useSwipe } from "../../hooks/use-swipe.ts";
import { hapticSelection } from "../../lib/haptics.ts";
import styles from "./segmented-control.module.css";

export interface SegmentedControlOption {
	key: string;
	label: string;
	id?: string;
	panelId?: string;
}

export interface SegmentedControlProps {
	options: SegmentedControlOption[];
	value: string;
	onChange: (key: string) => void;
	ariaLabel?: string;
	disabled?: boolean;
	variant?: "navigation" | "choice";
	semantics?: "tabs" | "radiogroup";
}

interface SegmentedControlStyle extends CSSProperties {
	"--segment-count": number;
	"--active-index": number;
}

export function SegmentedControl({
	options,
	value,
	onChange,
	ariaLabel,
	disabled = false,
	variant = "choice",
	semantics = "radiogroup",
}: SegmentedControlProps) {
	const activeIndex = options.findIndex((o) => o.key === value);
	const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

	const selectOption = useCallback(
		(index: number, moveFocus = false) => {
			const option = options[index];
			if (disabled || !option) return;
			if (option.key !== value) {
				hapticSelection();
				onChange(option.key);
			}
			if (moveFocus) buttonRefs.current[index]?.focus();
		},
		[disabled, onChange, options, value],
	);

	const handleSwipeLeft = useCallback(() => {
		if (!disabled && activeIndex < options.length - 1) {
			selectOption(activeIndex + 1);
		}
	}, [activeIndex, disabled, options.length, selectOption]);

	const handleSwipeRight = useCallback(() => {
		if (!disabled && activeIndex > 0) {
			selectOption(activeIndex - 1);
		}
	}, [activeIndex, disabled, selectOption]);

	const handleKeyDown = useCallback(
		(event: KeyboardEvent<HTMLButtonElement>, index: number) => {
			let nextIndex: number | undefined;
			switch (event.key) {
				case "ArrowRight":
					nextIndex = (index + 1) % options.length;
					break;
				case "ArrowLeft":
					nextIndex = (index - 1 + options.length) % options.length;
					break;
				case "ArrowDown":
					if (semantics === "tabs") return;
					nextIndex = (index + 1) % options.length;
					break;
				case "ArrowUp":
					if (semantics === "tabs") return;
					nextIndex = (index - 1 + options.length) % options.length;
					break;
				case "Home":
					nextIndex = 0;
					break;
				case "End":
					nextIndex = options.length - 1;
					break;
				default:
					return;
			}
			event.preventDefault();
			selectOption(nextIndex, true);
		},
		[options.length, selectOption, semantics],
	);

	const { onTouchStart, onTouchEnd } = useSwipe({
		onSwipeLeft: handleSwipeLeft,
		onSwipeRight: handleSwipeRight,
	});
	const rootStyle: SegmentedControlStyle = {
		"--segment-count": options.length,
		"--active-index": Math.max(activeIndex, 0),
	};

	return (
		<div
			className={`${styles.root} ${variant === "navigation" ? styles.navigation : styles.choice}`}
			aria-label={ariaLabel}
			role={semantics === "tabs" ? "tablist" : "radiogroup"}
			aria-disabled={disabled || undefined}
			style={rootStyle}
			onTouchStart={onTouchStart}
			onTouchEnd={onTouchEnd}
		>
			{options.map((opt, index) => (
				<button
					key={opt.key}
					ref={(element) => {
						buttonRefs.current[index] = element;
					}}
					id={opt.id}
					type="button"
					className={`${styles.btn} ${value === opt.key ? styles.active : ""}`}
					onClick={() => selectOption(index)}
					onKeyDown={(event) => handleKeyDown(event, index)}
					role={semantics === "tabs" ? "tab" : "radio"}
					aria-selected={semantics === "tabs" ? value === opt.key : undefined}
					aria-checked={semantics === "radiogroup" ? value === opt.key : undefined}
					aria-controls={semantics === "tabs" ? opt.panelId : undefined}
					tabIndex={value === opt.key ? 0 : -1}
					disabled={disabled}
				>
					{opt.label}
				</button>
			))}
		</div>
	);
}
