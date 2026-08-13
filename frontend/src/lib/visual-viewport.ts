const KEYBOARD_SHRINK_PX = 96;
const EDITABLE_INPUT_TYPES = new Set([
	"email",
	"number",
	"password",
	"search",
	"tel",
	"text",
	"url",
]);

const subscribers = new Set<() => void>();

let initialized = false;
let touchEditing = false;
let sessionBaselineHeight = 0;
let sessionSawViewportShrink = false;
let pointerActivationInProgress = false;
let syncFrame = 0;
let revealFrame = 0;

export function isEditableControl(target: Element | null): target is HTMLElement {
	if (!(target instanceof HTMLElement) || target.matches(":disabled")) return false;
	if (target instanceof HTMLTextAreaElement) return true;
	if (target instanceof HTMLInputElement) {
		const declaredType = target.getAttribute("type")?.toLowerCase() || "text";
		return EDITABLE_INPUT_TYPES.has(declaredType);
	}
	return target.isContentEditable;
}

function visualHeight(): number {
	return window.visualViewport?.height ?? window.innerHeight;
}

function baselineHeight(): number {
	return Math.max(visualHeight(), window.innerHeight);
}

function viewportIsShrunk(): boolean {
	return sessionBaselineHeight - visualHeight() >= KEYBOARD_SHRINK_PX;
}

function hasTouchInput(): boolean {
	return window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
}

function setTouchEditing(next: boolean): void {
	if (touchEditing === next) return;
	touchEditing = next;
	for (const subscriber of subscribers) subscriber();
}

function writeViewportCssVars(): void {
	const viewport = window.visualViewport;
	const height = viewport?.height ?? window.innerHeight;
	const offsetTop = viewport?.offsetTop ?? 0;
	const root = document.documentElement;
	root.style.setProperty("--fv-visual-viewport-height", `${height}px`);
	root.style.setProperty("--fv-visual-viewport-offset-top", `${offsetTop}px`);
}

function scheduleFocusedControlReveal(): void {
	window.cancelAnimationFrame(revealFrame);
	revealFrame = window.requestAnimationFrame(() => {
		revealFrame = window.requestAnimationFrame(() => {
			const focused = document.activeElement;
			if (!isEditableControl(focused)) return;
			focused.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
		});
	});
}

function beginTouchEditing(target: Element | null): void {
	if (!hasTouchInput() || !isEditableControl(target)) return;
	sessionBaselineHeight = Math.max(sessionBaselineHeight, baselineHeight());
	sessionSawViewportShrink = viewportIsShrunk();
	setTouchEditing(true);
	scheduleFocusedControlReveal();
}

function syncAfterFocusOut(): void {
	window.cancelAnimationFrame(syncFrame);
	syncFrame = window.requestAnimationFrame(() => {
		if (pointerActivationInProgress) return;
		const focused = document.activeElement;
		if (isEditableControl(focused)) {
			beginTouchEditing(focused);
			return;
		}

		const shrunk = viewportIsShrunk();
		if (shrunk) sessionSawViewportShrink = true;
		if (!sessionSawViewportShrink || !shrunk) {
			setTouchEditing(false);
			sessionSawViewportShrink = false;
			sessionBaselineHeight = baselineHeight();
		}
	});
}

function beginPointerActivation(event: PointerEvent): void {
	if (!touchEditing || isEditableControl(event.target as Element | null)) return;
	pointerActivationInProgress = true;
}

function finishPointerActivation(): void {
	if (!pointerActivationInProgress) return;
	window.setTimeout(() => {
		pointerActivationInProgress = false;
		syncAfterFocusOut();
	}, 0);
}

function syncViewport(): void {
	writeViewportCssVars();
	const focused = document.activeElement;
	const shrunk = viewportIsShrunk();

	if (touchEditing) {
		if (shrunk) sessionSawViewportShrink = true;
		if (isEditableControl(focused)) {
			scheduleFocusedControlReveal();
			return;
		}
		if (sessionSawViewportShrink && shrunk) return;
		setTouchEditing(false);
		sessionSawViewportShrink = false;
	}

	sessionBaselineHeight = Math.max(sessionBaselineHeight, baselineHeight());
}

/**
 * Binds the browser's visual viewport once for the whole application.
 *
 * The web platform has no cross-browser keyboard-open event. Editable focus starts a touch-editing
 * session immediately; VisualViewport supplies geometry and confirms when the keyboard-close
 * animation has restored the visible area.
 */
export function initVisualViewport(): void {
	if (initialized || typeof window === "undefined") return;
	initialized = true;
	sessionBaselineHeight = baselineHeight();
	writeViewportCssVars();

	document.addEventListener("focusin", (event) =>
		beginTouchEditing(event.target as Element | null),
	);
	document.addEventListener("focusout", syncAfterFocusOut);
	document.addEventListener("pointerdown", beginPointerActivation, true);
	document.addEventListener("pointerup", finishPointerActivation, true);
	document.addEventListener("pointercancel", finishPointerActivation, true);
	window.visualViewport?.addEventListener("resize", syncViewport, { passive: true });
	window.visualViewport?.addEventListener("scroll", writeViewportCssVars, { passive: true });
	window.addEventListener("resize", syncViewport, { passive: true });
}

export function subscribeTouchEditing(subscriber: () => void): () => void {
	subscribers.add(subscriber);
	return () => subscribers.delete(subscriber);
}

export function getTouchEditingSnapshot(): boolean {
	return touchEditing;
}
