import { useEffect, useState } from "react";

const KEYBOARD_SHRINK_PX = 96;
const INPUT_TYPES = new Set(["email", "number", "password", "search", "tel", "text", "url"]);

function isKeyboardControl(target: Element | null): target is HTMLElement {
	if (!(target instanceof HTMLElement) || target.matches(":disabled")) return false;
	if (target instanceof HTMLTextAreaElement) return true;
	if (target instanceof HTMLInputElement) {
		const declaredType = target.getAttribute("type")?.toLowerCase() || "text";
		return INPUT_TYPES.has(declaredType);
	}
	return target.isContentEditable;
}

/**
 * Tracks software input without moving fixed chrome with the visual viewport.
 * Focus is the immediate iOS signal; VisualViewport confirms keyboard resize and restoration.
 */
export function useKeyboardVisibility(): boolean {
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		const visualViewport = window.visualViewport;
		const coarsePointer = window.matchMedia("(pointer: coarse)");
		let stableHeight = Math.max(
			window.innerHeight,
			document.documentElement.clientHeight,
			visualViewport?.height ?? 0,
		);
		let viewportWasShrunk = false;
		let frame = 0;

		const currentHeight = () => visualViewport?.height ?? window.innerHeight;
		const viewportIsShrunk = () => {
			const offsetTop = visualViewport?.offsetTop ?? 0;
			return stableHeight - (currentHeight() + offsetTop) >= KEYBOARD_SHRINK_PX;
		};

		const sync = (source: "focus" | "blur" | "viewport") => {
			const focused = isKeyboardControl(document.activeElement);
			if (!focused) {
				stableHeight = Math.max(stableHeight, currentHeight(), window.innerHeight);
				viewportWasShrunk = false;
				setVisible(false);
				return;
			}

			const shrunk = viewportIsShrunk();
			if (shrunk) viewportWasShrunk = true;
			if (source === "viewport" && viewportWasShrunk && !shrunk) {
				viewportWasShrunk = false;
				setVisible(false);
				return;
			}

			setVisible(shrunk || coarsePointer.matches || navigator.maxTouchPoints > 0);
		};

		const scheduleSync = (source: "blur" | "viewport") => {
			cancelAnimationFrame(frame);
			frame = requestAnimationFrame(() => sync(source));
		};
		const handleFocusIn = () => sync("focus");
		const handleFocusOut = () => scheduleSync("blur");
		const handleViewportChange = () => scheduleSync("viewport");

		document.addEventListener("focusin", handleFocusIn);
		document.addEventListener("focusout", handleFocusOut);
		visualViewport?.addEventListener("resize", handleViewportChange, { passive: true });
		visualViewport?.addEventListener("scroll", handleViewportChange, { passive: true });
		window.addEventListener("resize", handleViewportChange, { passive: true });
		coarsePointer.addEventListener("change", handleViewportChange);

		return () => {
			cancelAnimationFrame(frame);
			document.removeEventListener("focusin", handleFocusIn);
			document.removeEventListener("focusout", handleFocusOut);
			visualViewport?.removeEventListener("resize", handleViewportChange);
			visualViewport?.removeEventListener("scroll", handleViewportChange);
			window.removeEventListener("resize", handleViewportChange);
			coarsePointer.removeEventListener("change", handleViewportChange);
		};
	}, []);

	return visible;
}
