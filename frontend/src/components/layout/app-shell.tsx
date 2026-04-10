/**
 * App shell — floating header + scrollable content + floating tab bar + edge blur overlays.
 */
import { Outlet } from "@tanstack/react-router";
import { useScrollCompact } from "../../hooks/use-scroll-compact.ts";
import styles from "./app-shell.module.css";
import { EdgeBlur } from "./edge-blur.tsx";
import { Header } from "./header.tsx";
import { TabBar } from "./tab-bar.tsx";

export function AppShell() {
	const { compact, onScroll } = useScrollCompact();
	return (
		<div className={styles.shell}>
			<EdgeBlur side="top" />
			<Header />
			<main className={styles.content} onScroll={onScroll}>
				<Outlet />
			</main>
			<TabBar compact={compact} />
			<EdgeBlur side="bottom" />
		</div>
	);
}
