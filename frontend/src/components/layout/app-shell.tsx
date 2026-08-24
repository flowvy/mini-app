import { Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { viewport } from "@telegram-apps/sdk-react";
import { type FocusEvent, useCallback, useEffect, useRef, useState } from "react";
import { ModeProvider } from "../../contexts/mode-context.tsx";
import { useBackButton } from "../../hooks/use-back-button.ts";
import { useScrollCompact } from "../../hooks/use-scroll-compact.ts";
import { isPrimaryTabRoute } from "../../lib/navigation-routes.ts";
import { useCurrentUser } from "../auth-guard.tsx";
import { ErrorState } from "../ui/error-state.tsx";
import styles from "./app-shell.module.css";
import { EdgeBlur } from "./edge-blur.tsx";
import { Header } from "./header.tsx";
import { TabBar } from "./tab-bar.tsx";

export function AppShell() {
	useBackButton();
	return (
		<ModeProvider>
			<AppShellContent />
		</ModeProvider>
	);
}

function AppShellContent() {
	const user = useCurrentUser();
	const navigate = useNavigate();
	const location = useLocation();
	const showTabBar = isPrimaryTabRoute(location.pathname);
	const [isKeyboardSettling, setIsKeyboardSettling] = useState(false);
	const keyboardBaselineRef = useRef<number | null>(null);
	const removeViewportListenerRef = useRef<(() => void) | null>(null);
	const { compact, scrollRef } = useScrollCompact();
	const adminDenied = location.pathname.startsWith("/admin/") && user.role !== "admin";
	const clearKeyboardSession = useCallback(() => {
		removeViewportListenerRef.current?.();
		removeViewportListenerRef.current = null;
		keyboardBaselineRef.current = null;
		setIsKeyboardSettling(false);
	}, []);

	useEffect(
		() => () => {
			removeViewportListenerRef.current?.();
		},
		[],
	);

	const handleFocusCapture = useCallback((event: FocusEvent<HTMLDivElement>) => {
		if (!isEditableTextEntry(event.target)) return;
		removeViewportListenerRef.current?.();
		removeViewportListenerRef.current = null;
		setIsKeyboardSettling(false);
		if (keyboardBaselineRef.current === null) {
			keyboardBaselineRef.current = viewport.stableHeight();
		}
	}, []);

	const handleBlurCapture = useCallback(
		(event: FocusEvent<HTMLDivElement>) => {
			if (!isEditableTextEntry(event.target) || isEditableTextEntry(event.relatedTarget)) return;
			const baseline = keyboardBaselineRef.current;
			if (
				baseline === null ||
				!viewport.isMounted() ||
				!window.matchMedia("(hover: none) and (pointer: coarse)").matches ||
				viewport.stableHeight() >= baseline
			) {
				clearKeyboardSession();
				return;
			}

			setIsKeyboardSettling(true);
			removeViewportListenerRef.current?.();
			removeViewportListenerRef.current = viewport.state.sub((current, previous) => {
				const heightChanged =
					current.height !== previous.height || current.stableHeight !== previous.stableHeight;
				if (heightChanged && current.height === current.stableHeight) {
					clearKeyboardSession();
				}
			});
		},
		[clearKeyboardSession],
	);
	return (
		<div
			className={`${styles.shell} ${showTabBar ? "" : styles.withoutTabBar} ${isKeyboardSettling ? styles.keyboardSettling : ""}`}
			onFocusCapture={handleFocusCapture}
			onBlurCapture={handleBlurCapture}
		>
			<EdgeBlur side="top" />
			<Header />
			<main
				ref={scrollRef}
				className={styles.content}
				data-scroll-restoration-id="main-content"
				// biome-ignore lint/a11y/noNoninteractiveTabindex: this overflow region must be keyboard-scrollable in Safari.
				tabIndex={0}
			>
				{adminDenied ? (
					<ErrorState variant="forbidden" onAction={() => navigate({ to: "/" })} />
				) : (
					<div key={location.pathname} className={styles.routeView}>
						<Outlet />
					</div>
				)}
			</main>
			{showTabBar && (
				<div className={styles.bottomNavigation}>
					<TabBar compact={compact} />
					<EdgeBlur side="bottom" />
				</div>
			)}
		</div>
	);
}

function isEditableTextEntry(target: EventTarget | null): target is HTMLElement {
	return (
		target instanceof HTMLElement &&
		target.matches(":is(input, textarea, [contenteditable]):read-write")
	);
}
