/**
 * App shell — floating header + scrollable content + floating tab bar + edge blur overlays.
 */
import { Outlet } from "@tanstack/react-router";
import { useBackButton } from "../../hooks/use-back-button.ts";
import { useScrollCompact } from "../../hooks/use-scroll-compact.ts";
import styles from "./app-shell.module.css";
import { EdgeBlur } from "./edge-blur.tsx";
import { Header } from "./header.tsx";
import { TabBar } from "./tab-bar.tsx";

export function AppShell() {
	useBackButton();
	const { compact, scrollRef } = useScrollCompact();
	return (
		<div className={styles.shell}>
			<EdgeBlur side="top" />
			<Header />
			<main ref={scrollRef} className={styles.content} data-scroll-restoration-id="main-content">
				<Outlet />
			</main>
			<TabBar compact={compact} />
			<EdgeBlur side="bottom" />
		</div>
	);
}
