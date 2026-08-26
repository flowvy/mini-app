/**
 * Thin wrappers around Telegram Mini App haptic feedback.
 * Every call is non-critical: guarded by isAvailable() + try/catch.
 */
import { hapticFeedback } from "@tma.js/sdk-react";

export function hapticImpact(style: "light" | "medium" | "heavy" = "light"): void {
	try {
		if (hapticFeedback.impactOccurred.isAvailable()) {
			hapticFeedback.impactOccurred(style);
		}
	} catch {
		/* non-critical */
	}
}

export function hapticNotification(type: "success" | "warning" | "error"): void {
	try {
		if (hapticFeedback.notificationOccurred.isAvailable()) {
			hapticFeedback.notificationOccurred(type);
		}
	} catch {
		/* non-critical */
	}
}

export function hapticSelection(): void {
	try {
		if (hapticFeedback.selectionChanged.isAvailable()) {
			hapticFeedback.selectionChanged();
		}
	} catch {
		/* non-critical */
	}
}
