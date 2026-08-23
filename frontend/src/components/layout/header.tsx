/**
 * App header — shows page title (or logo + app name on home) and admin/user mode toggle.
 */
import { useLocation, useNavigate } from "@tanstack/react-router";
import {
	Activity,
	HelpCircle,
	Languages,
	Megaphone,
	MessageSquareText,
	Palette,
	Settings,
	ShieldCheck,
	Smartphone,
	User,
	UserStar,
	Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { type AppMode, useMode } from "../../contexts/mode-context.tsx";
import { hapticSelection } from "../../lib/haptics.ts";
import { useCurrentUser } from "../auth-guard.tsx";
import { AppLogo } from "../ui/app-logo.tsx";
import { BeszelIcon, TributeIcon, UptimeKumaIcon } from "../ui/service-brand-icon.tsx";
import styles from "./header.module.css";

interface PageMeta {
	title: string;
	icon: ReactNode;
}

const PAGE_META: Record<string, PageMeta> = {
	"/pulse": { title: "common.header.pulse", icon: <Activity size={16} /> },
	"/devices": { title: "common.header.devices", icon: <Smartphone size={16} /> },
	"/support": { title: "common.header.support", icon: <HelpCircle size={16} /> },
	"/admin/users": { title: "common.header.users", icon: <Users size={16} /> },
	"/admin/broadcast": { title: "common.header.broadcast", icon: <Megaphone size={16} /> },
	"/admin/settings": { title: "common.header.settings", icon: <Settings size={16} /> },
	"/admin/settings/pulse": {
		title: "common.header.settingsPulse",
		icon: <Activity size={16} />,
	},
	"/admin/settings/kuma": {
		title: "common.header.settingsKuma",
		icon: <UptimeKumaIcon size={16} />,
	},
	"/admin/settings/beszel": {
		title: "common.header.settingsBeszel",
		icon: <BeszelIcon size={16} />,
	},
	"/admin/settings/tribute": {
		title: "common.header.settingsTribute",
		icon: <TributeIcon size={16} />,
	},
	"/admin/settings/access": {
		title: "common.header.settingsAccess",
		icon: <ShieldCheck size={16} />,
	},
	"/admin/settings/branding": {
		title: "common.header.settingsIdentity",
		icon: <Palette size={16} />,
	},
	"/admin/settings/welcome": {
		title: "common.header.settingsWelcome",
		icon: <MessageSquareText size={16} />,
	},
	"/admin/settings/content": {
		title: "common.header.settingsContent",
		icon: <Languages size={16} />,
	},
	"/admin/settings/communication": {
		title: "common.header.settingsCommunication",
		icon: <MessageSquareText size={16} />,
	},
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
		Object.entries(PAGE_META)
			.sort(([left], [right]) => right.length - left.length)
			.find(([path]) => location.pathname.startsWith(`${path}/`))?.[1];

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
						<span className={styles.titleIcon}>{meta.icon}</span>
						<span className={styles.title}>{t(meta.title)}</span>
					</div>
				) : (
					<div className={styles.titleGroup}>
						<AppLogo logoUrl={user.branding.logoUrl} size={20} />
						<span className={styles.title}>{user.branding.appName || t("common.appName")}</span>
					</div>
				)}
				{isAdmin && (
					<button
						type="button"
						role="switch"
						aria-checked={mode === "admin"}
						aria-label={t("common.header.adminModeLabel")}
						className={`${styles.modeSwitch} ${mode === "admin" ? styles.adminMode : ""}`}
						onClick={() => handleToggle(mode === "admin" ? "user" : "admin")}
					>
						<span className={styles.modeThumb} aria-hidden="true">
							<span className={`${styles.modeIcon} ${styles.userIcon}`}>
								<User size={14} strokeWidth={2.25} />
							</span>
							<span className={`${styles.modeIcon} ${styles.adminIcon}`}>
								<UserStar size={14} strokeWidth={2.25} />
							</span>
						</span>
					</button>
				)}
			</header>
		</div>
	);
}
