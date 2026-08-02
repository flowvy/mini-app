import type { KeyboardEvent } from "react";
import { hideVirtualKeyboard } from "./telegram.ts";

/** Finish single-line editing without interrupting IME composition. */
export function dismissKeyboardOnEnter(event: KeyboardEvent<HTMLInputElement>): void {
	if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
	event.preventDefault();
	hideVirtualKeyboard(event.currentTarget);
}
