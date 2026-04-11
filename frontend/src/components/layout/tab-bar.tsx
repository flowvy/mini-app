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
import { useCallback, useEffect, useState } from "react";
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
	const location = useLocation();
	const showPulse = user.features?.pulse ?? false;
	const userTabs = showPulse ? USER_TABS : USER_TABS.filter((tab) => tab.to !== "/pulse");
	const tabs = mode === "admin" ? ADMIN_TABS : userTabs;

	const activeIndex = tabs.findIndex((tab) => tab.to === location.pathname);
	const pillStyle =
		activeIndex >= 0
			? {
					width: `calc((100% - 4px) / ${tabs.length})`,
					transform: `translateX(${activeIndex * 100}%)`,
				}
			: { opacity: 0 };

	const [bouncingIndex, setBouncingIndex] = useState<number | null>(null);

	const handleClick = useCallback((index: number) => {
		hapticImpact("light");
		setBouncingIndex(index);
	}, []);

	useEffect(() => {
		if (bouncingIndex === null) return;
		const timer = setTimeout(() => setBouncingIndex(null), 400);
		return () => clearTimeout(timer);
	}, [bouncingIndex]);

	return (
		<nav className={`${styles.tabBar} ${compact ? styles.compact : ""}`}>
			<div className={styles.pill} style={pillStyle} />
			{tabs.map((tab, index) => {
				const Icon = tab.icon;
				const isActive = tab.to === location.pathname;
				return (
					<Link
						key={tab.to}
						to={tab.to}
						activeOptions={{ exact: true }}
						className={`${styles.tab} ${isActive ? styles.selected : ""}`}
						onClick={() => handleClick(index)}
					>
						<span className={`${styles.icon} ${bouncingIndex === index ? styles.bouncing : ""}`}>
							<Icon size={26} />
						</span>
						<span className={styles.label}>{t(tab.label)}</span>
					</Link>
				);
			})}
		</nav>
	);
}
