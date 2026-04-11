import { useEffect, useRef, useState } from "react";

export function useScrollCompact(threshold = 50) {
	const [compact, setCompact] = useState(false);
	const scrollRef = useRef<HTMLElement>(null);

	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;

		let lastCompact = false;

		const handleScroll = () => {
			const next = el.scrollTop > threshold;
			if (next !== lastCompact) {
				lastCompact = next;
				setCompact(next);
			}
		};

		el.addEventListener("scroll", handleScroll, { passive: true });
		return () => el.removeEventListener("scroll", handleScroll);
	}, [threshold]);

	return { compact, scrollRef };
}
