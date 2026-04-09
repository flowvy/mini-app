/**
 * App shell — floating header + scrollable content + floating tab bar + edge blur overlays.
 */
import { Outlet } from "@tanstack/react-router";
import { useScrollCompact } from "../../hooks/use-scroll-compact.ts";
import styles from "./app-shell.module.css";
import { Header } from "./header.tsx";
import { TabBar } from "./tab-bar.tsx";

export function AppShell() {
	const { compact, onScroll } = useScrollCompact();
	return (
		<div className={styles.shell}>
			<div className={styles.edgeTop} />
			<Header />
			<main className={styles.content} onScroll={onScroll}>
				<Outlet />
			</main>
			<TabBar compact={compact} />
			<div className={styles.edgeBottom} />
		</div>
	);
}
