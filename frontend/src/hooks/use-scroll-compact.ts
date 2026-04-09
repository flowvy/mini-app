import { useCallback, useState } from "react";

export function useScrollCompact(threshold = 50) {
	const [compact, setCompact] = useState(false);
	const onScroll = useCallback(
		(e: React.UIEvent<HTMLElement>) => {
			setCompact(e.currentTarget.scrollTop > threshold);
		},
		[threshold],
	);
	return { compact, onScroll };
}
