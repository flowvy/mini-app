import { useCallback, useRef } from "react";

interface UseSwipeOptions {
	onSwipeLeft?: () => void;
	onSwipeRight?: () => void;
	/** Minimum horizontal distance to trigger swipe (px) */
	threshold?: number;
	/** Dead zone from screen edges to avoid iOS edge-swipe conflict (px) */
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

			// Ignore if vertical movement is greater (user is scrolling)
			if (Math.abs(dy) > Math.abs(dx)) return;

			// Ignore if started in edge dead zone
			const screenWidth = window.innerWidth;
			if (startX.current < edgeDeadZone || startX.current > screenWidth - edgeDeadZone) return;

			// Ignore if below threshold
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
