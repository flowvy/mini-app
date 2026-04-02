/**
 * App shell — header + page content + bottom tab bar.
 */
import { Outlet } from "@tanstack/react-router";
import styles from "./app-shell.module.css";
import { Header } from "./header.tsx";
import { TabBar } from "./tab-bar.tsx";

export function AppShell() {
	return (
		<div className={styles.shell}>
			<Header />
			<main className={styles.content}>
				<Outlet />
			</main>
			<TabBar />
		</div>
	);
}
