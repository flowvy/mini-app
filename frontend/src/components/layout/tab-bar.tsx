/**
 * Bottom tab bar — renders user or admin tabs based on current mode.
 */
import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
	Activity,
	HelpCircle,
	Home,
	LayoutDashboard,
	Megaphone,
	Settings,
	Smartphone,
	Users,
} from "lucide-react";
import { useMode } from "../../contexts/mode-context.tsx";
import { useCurrentUser } from "../auth-guard.tsx";
import styles from "./tab-bar.module.css";

interface TabDefinition {
	to: string;
	label: string;
	icon: LucideIcon;
}

const USER_TABS: TabDefinition[] = [
	{ to: "/", label: "Home", icon: Home },
	{ to: "/pulse", label: "Pulse", icon: Activity },
	{ to: "/devices", label: "Devices", icon: Smartphone },
	{ to: "/support", label: "Support", icon: HelpCircle },
];

const ADMIN_TABS: TabDefinition[] = [
	{ to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
	{ to: "/admin/users", label: "Users", icon: Users },
	{ to: "/admin/broadcast", label: "Broadcast", icon: Megaphone },
	{ to: "/admin/settings", label: "Settings", icon: Settings },
];

export function TabBar() {
	const { mode } = useMode();
	const user = useCurrentUser();
	const showPulse = user.features?.pulse ?? false;
	const userTabs = showPulse ? USER_TABS : USER_TABS.filter((t) => t.to !== "/pulse");
	const tabs = mode === "admin" ? ADMIN_TABS : userTabs;

	return (
		<nav className={styles.tabBar}>
			{tabs.map((tab) => (
				<Link key={tab.to} to={tab.to} activeOptions={{ exact: true }} className={styles.tab}>
					{({ isActive }) => {
						const Icon = tab.icon;
						return (
							<div className={`${styles.tabInner} ${isActive ? styles.active : ""}`}>
								<span className={styles.icon}>
									<Icon size={20} />
								</span>
								<span className={styles.label}>{tab.label}</span>
							</div>
						);
					}}
				</Link>
			))}
		</nav>
	);
}
