import { type CSSProperties, type KeyboardEvent, useCallback, useId, useRef } from "react";
import { useSwipe } from "../../hooks/use-swipe.ts";
import { hapticSelection } from "../../lib/haptics.ts";
import styles from "./segmented-control.module.css";

interface SegmentedControlOption {
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
	semantics?: "tabs" | "choice";
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
	semantics = "choice",
}: SegmentedControlProps) {
	const activeIndex = options.findIndex((o) => o.key === value);
	const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
	const radioName = useId();

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
	const renderedOptions = options.map((opt, index) => {
		if (semantics === "choice") {
			return (
				<label key={opt.key} className={`${styles.btn} ${value === opt.key ? styles.active : ""}`}>
					<input
						className={styles.radio}
						type="radio"
						name={radioName}
						value={opt.key}
						checked={value === opt.key}
						onChange={() => selectOption(index)}
						disabled={disabled}
					/>
					<span>{opt.label}</span>
				</label>
			);
		}

		const commonProps = {
			ref: (element: HTMLButtonElement | null) => {
				buttonRefs.current[index] = element;
			},
			id: opt.id,
			type: "button" as const,
			className: `${styles.btn} ${value === opt.key ? styles.active : ""}`,
			onClick: () => selectOption(index),
			onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => handleKeyDown(event, index),
			tabIndex: value === opt.key ? 0 : -1,
			disabled,
		};

		return (
			<button
				key={opt.key}
				{...commonProps}
				role="tab"
				aria-selected={value === opt.key}
				aria-controls={opt.panelId}
			>
				{opt.label}
			</button>
		);
	});
	const rootProps = {
		className: `${styles.root} ${variant === "navigation" ? styles.navigation : styles.choice}`,
		"aria-label": ariaLabel,
		"aria-disabled": disabled || undefined,
		style: rootStyle,
		onTouchStart,
		onTouchEnd,
	};

	return semantics === "tabs" ? (
		<div {...rootProps} role="tablist">
			{renderedOptions}
		</div>
	) : (
		<fieldset {...rootProps} disabled={disabled}>
			{renderedOptions}
		</fieldset>
	);
}
