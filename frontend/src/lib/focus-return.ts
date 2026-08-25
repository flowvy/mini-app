const SUPPRESS_FOCUS_RING_ATTRIBUTE = "data-suppress-focus-ring";

interface FocusOptionsWithVisible extends FocusOptions {
	focusVisible?: boolean;
}

export interface FocusReturnTarget {
	element: HTMLElement | null;
	showFocusRing: boolean;
}

/** Capture both the return target and the input modality before a modal takes focus. */
export function captureFocusReturnTarget(element?: HTMLElement | null): FocusReturnTarget {
	const target =
		element ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
	return {
		element: target,
		showFocusRing:
			(target?.matches(":focus-visible") ?? false) &&
			!target?.hasAttribute(SUPPRESS_FOCUS_RING_ATTRIBUTE),
	};
}

/**
 * Return DOM focus for continuity, without presenting a keyboard focus ring after a pointer close.
 * The attribute is a fallback for WebViews that do not implement FocusOptions.focusVisible yet.
 */
export function restoreFocusTarget(
	target: FocusReturnTarget,
	element: HTMLElement | null = target.element,
): void {
	if (!element?.isConnected) return;

	if (target.showFocusRing) {
		element.removeAttribute(SUPPRESS_FOCUS_RING_ATTRIBUTE);
	} else {
		element.setAttribute(SUPPRESS_FOCUS_RING_ATTRIBUTE, "");
		const clearSuppression = () => {
			element.removeAttribute(SUPPRESS_FOCUS_RING_ATTRIBUTE);
		};
		element.addEventListener("blur", clearSuppression, { once: true });
		element.addEventListener("keydown", clearSuppression, { once: true });
	}

	element.focus({
		preventScroll: true,
		focusVisible: target.showFocusRing,
	} as FocusOptionsWithVisible);
}
