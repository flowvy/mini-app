import { Link, useLocation } from "@tanstack/react-router";
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
	hidden?: boolean;
}

export function TabBar({ compact, hidden = false }: TabBarProps) {
	const { t } = useTranslation();
	const { mode } = useMode();
	const user = useCurrentUser();
	const location = useLocation();
	const showPulse = user.features?.pulse ?? false;
	const userTabs = showPulse ? USER_TABS : USER_TABS.filter((tab) => tab.to !== "/pulse");
	const tabs = mode === "admin" ? ADMIN_TABS : userTabs;

	const isActiveTab = (tabTo: string) =>
		tabTo === "/" ? location.pathname === "/" : location.pathname.startsWith(tabTo);

	return (
		<nav
			className={`${styles.tabBar} ${compact ? styles.compact : ""} ${hidden ? styles.keyboardHidden : ""}`}
			aria-hidden={hidden || undefined}
			inert={hidden || undefined}
		>
			{tabs.map((tab) => {
				const Icon = tab.icon;
				const isActive = isActiveTab(tab.to);
				return (
					<Link
						key={tab.to}
						to={tab.to}
						activeOptions={{ exact: tab.to === "/" }}
						className={`${styles.tab} ${isActive ? styles.selected : ""}`}
						onClick={() => hapticImpact("light")}
					>
						<span className={styles.icon}>
							<Icon size={26} />
						</span>
						<span className={styles.label}>{t(tab.label)}</span>
					</Link>
				);
			})}
		</nav>
	);
}
