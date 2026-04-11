/**
 * App header — shows page title (or logo + app name on home) and admin/user mode toggle.
 */
import { useLocation, useNavigate } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
	Activity,
	HelpCircle,
	Megaphone,
	Settings,
	Smartphone,
	User,
	UserStar,
	Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { type AppMode, useMode } from "../../contexts/mode-context.tsx";
import { hapticSelection } from "../../lib/haptics.ts";
import { useCurrentUser } from "../auth-guard.tsx";
import { AppLogo } from "../ui/app-logo.tsx";
import styles from "./header.module.css";

interface PageMeta {
	title: string;
	icon: LucideIcon;
}

const PAGE_META: Record<string, PageMeta> = {
	"/pulse": { title: "common.header.pulse", icon: Activity },
	"/devices": { title: "common.header.devices", icon: Smartphone },
	"/support": { title: "common.header.support", icon: HelpCircle },
	"/admin/users": { title: "common.header.users", icon: Users },
	"/admin/broadcast": { title: "common.header.broadcast", icon: Megaphone },
	"/admin/settings": { title: "common.header.settings", icon: Settings },
	"/admin/settings/kuma": { title: "common.header.settings", icon: Settings },
	"/admin/settings/branding": { title: "common.header.settings", icon: Settings },
	"/admin/settings/welcome": { title: "common.header.settings", icon: Settings },
};

export function Header() {
	const { t } = useTranslation();
	const user = useCurrentUser();
	const { mode, setMode } = useMode();
	const navigate = useNavigate();
	const location = useLocation();
	const isAdmin = user.role === "admin";

	const meta =
		PAGE_META[location.pathname] ??
		Object.entries(PAGE_META).find(([path]) => location.pathname.startsWith(`${path}/`))?.[1];

	const handleToggle = (next: AppMode) => {
		if (next === mode) return;
		hapticSelection();
		setMode(next);
		const target = next === "admin" ? "/admin/dashboard" : "/";
		void navigate({ to: target });
	};

	return (
		<div className={styles.headerWrap}>
			<header className={styles.header}>
				{meta ? (
					<div className={styles.titleGroup}>
						<meta.icon size={16} className={styles.titleIcon} />
						<span className={styles.title}>{t(meta.title)}</span>
					</div>
				) : (
					<div className={styles.titleGroup}>
						<AppLogo logoUrl={user.branding.logoUrl} size={20} />
						<span className={styles.title}>{user.branding.appName || t("common.appName")}</span>
					</div>
				)}
				{isAdmin && (
					<div className={styles.toggle}>
						<button
							type="button"
							className={`${styles.toggleBtn} ${mode === "user" ? styles.activeBtn : ""}`}
							onClick={() => handleToggle("user")}
							aria-label={t("common.header.userModeLabel")}
						>
							<User size={16} />
						</button>
						<button
							type="button"
							className={`${styles.toggleBtn} ${mode === "admin" ? styles.activeBtn : ""}`}
							onClick={() => handleToggle("admin")}
							aria-label={t("common.header.adminModeLabel")}
						>
							<UserStar size={16} />
						</button>
					</div>
				)}
			</header>
		</div>
	);
}
