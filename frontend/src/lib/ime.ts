import type { KeyboardEvent } from "react";

export type ImeActionHint = "enter" | "done" | "go" | "next" | "previous" | "search" | "send";

const TEXT_ENTRY_SELECTOR = [
	"input:not([type])",
	'input[type="text"]',
	'input[type="search"]',
	'input[type="url"]',
	'input[type="email"]',
	'input[type="tel"]',
	'input[type="number"]',
	'input[type="password"]',
	"textarea",
	'[contenteditable="true"]',
].join(",");

function isAvailableTextEntry(element: HTMLElement): boolean {
	if (element.matches(":disabled, [readonly], [aria-disabled='true']")) return false;
	return element.getClientRects().length > 0;
}

/** Move to the next rendered text-entry control in the current form/task surface. */
export function focusNextTextEntry(current: HTMLElement): boolean {
	const scope =
		current.closest<HTMLElement>("form, dialog, [data-ime-scope], main") ?? document.body;
	const entries = Array.from(scope.querySelectorAll<HTMLElement>(TEXT_ENTRY_SELECTOR)).filter(
		isAvailableTextEntry,
	);
	const currentIndex = entries.indexOf(current);
	const next = currentIndex >= 0 ? entries[currentIndex + 1] : undefined;
	if (!next) return false;
	next.focus();
	return document.activeElement === next;
}

/** Pair a visible IME hint with its focus behavior without global keyboard or viewport hooks. */
export function handleImeKeyDown(
	event: KeyboardEvent<HTMLInputElement>,
	action: ImeActionHint,
	onAction?: () => void,
): void {
	if (event.key !== "Enter" || event.nativeEvent.isComposing) return;

	if (action === "next") {
		event.preventDefault();
		if (!focusNextTextEntry(event.currentTarget)) event.currentTarget.blur();
		return;
	}

	if (action === "done") {
		event.preventDefault();
		event.currentTarget.blur();
		return;
	}

	if (onAction && (action === "go" || action === "search" || action === "send")) {
		event.preventDefault();
		onAction();
		event.currentTarget.blur();
	}
}
