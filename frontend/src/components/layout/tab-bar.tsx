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
import { useTranslation } from "react-i18next";
import { useMode } from "../../contexts/mode-context.tsx";
import { hapticImpact } from "../../lib/haptics.ts";
import { useCurrentUser } from "../auth-guard.tsx";
import styles from "./tab-bar.module.css";

interface TabDefinition {
	to: string;
	label: string;
	icon: LucideIcon;
}

const USER_TABS: TabDefinition[] = [
	{ to: "/", label: "common.tab.home", icon: Home },
	{ to: "/pulse", label: "common.tab.pulse", icon: Activity },
	{ to: "/devices", label: "common.tab.devices", icon: Smartphone },
	{ to: "/support", label: "common.tab.support", icon: HelpCircle },
];

const ADMIN_TABS: TabDefinition[] = [
	{ to: "/admin/dashboard", label: "common.tab.dashboard", icon: LayoutDashboard },
	{ to: "/admin/users", label: "common.tab.users", icon: Users },
	{ to: "/admin/broadcast", label: "common.tab.broadcast", icon: Megaphone },
	{ to: "/admin/settings", label: "common.tab.settings", icon: Settings },
];

interface TabBarProps {
	compact?: boolean;
}

export function TabBar({ compact }: TabBarProps) {
	const { t } = useTranslation();
	const { mode } = useMode();
	const user = useCurrentUser();
	const showPulse = user.features?.pulse ?? false;
	const userTabs = showPulse ? USER_TABS : USER_TABS.filter((t) => t.to !== "/pulse");
	const tabs = mode === "admin" ? ADMIN_TABS : userTabs;

	return (
		<nav className={`${styles.tabBar} ${compact ? styles.compact : ""}`}>
			{tabs.map((tab) => {
				const Icon = tab.icon;
				return (
					<Link
						key={tab.to}
						to={tab.to}
						activeOptions={{ exact: true }}
						className={styles.tab}
						activeProps={{ className: styles.selected }}
						onClick={() => hapticImpact("light")}
					>
						<Icon size={26} className={styles.icon} />
						<span className={styles.label}>{t(tab.label)}</span>
					</Link>
				);
			})}
		</nav>
	);
}
