import { useCallback, useRef } from "react";

interface UseSwipeOptions {
	onSwipeLeft?: () => void;
	onSwipeRight?: () => void;
	threshold?: number;
	/** Avoid intercepting the native iOS edge-swipe gesture. */
	edgeDeadZone?: number;
}

export function useSwipe({
	onSwipeLeft,
	onSwipeRight,
	threshold = 50,
	edgeDeadZone = 20,
}: UseSwipeOptions) {
	const startX = useRef(0);
	const startY = useRef(0);

	const onTouchStart = useCallback((e: React.TouchEvent) => {
		const touch = e.touches[0];
		startX.current = touch.clientX;
		startY.current = touch.clientY;
	}, []);

	const onTouchEnd = useCallback(
		(e: React.TouchEvent) => {
			const touch = e.changedTouches[0];
			const dx = touch.clientX - startX.current;
			const dy = touch.clientY - startY.current;

			if (Math.abs(dy) > Math.abs(dx)) return;

			const screenWidth = window.innerWidth;
			if (startX.current < edgeDeadZone || startX.current > screenWidth - edgeDeadZone) return;

			if (Math.abs(dx) < threshold) return;

			if (dx < 0) {
				onSwipeLeft?.();
			} else {
				onSwipeRight?.();
			}
		},
		[onSwipeLeft, onSwipeRight, threshold, edgeDeadZone],
	);

	return { onTouchStart, onTouchEnd };
}
