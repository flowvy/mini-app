import { useSyncExternalStore } from "react";
import { getTouchEditingSnapshot, subscribeTouchEditing } from "../lib/visual-viewport.ts";

/** Returns the shared touch-editing lifecycle used by bottom application chrome. */
export function useTouchEditing(): boolean {
	return useSyncExternalStore(subscribeTouchEditing, getTouchEditingSnapshot, () => false);
}
