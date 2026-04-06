/**
 * App header — shows page title (or "Flowvy" on home) and admin/user mode toggle.
 */
import { useLocation, useNavigate } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { Activity, HelpCircle, Megaphone, Smartphone, User, UserStar, Users } from "lucide-react";
import { type AppMode, useMode } from "../../contexts/mode-context.tsx";
import { useCurrentUser } from "../auth-guard.tsx";
import styles from "./header.module.css";

interface PageMeta {
	title: string;
	icon: LucideIcon;
}

const PAGE_META: Record<string, PageMeta> = {
	"/pulse": { title: "Pulse", icon: Activity },
	"/devices": { title: "Devices", icon: Smartphone },
	"/support": { title: "Support", icon: HelpCircle },
	"/admin/users": { title: "Users", icon: Users },
	"/admin/broadcast": { title: "Broadcast", icon: Megaphone },
};

export function Header() {
	const user = useCurrentUser();
	const { mode, setMode } = useMode();
	const navigate = useNavigate();
	const location = useLocation();
	const isAdmin = user.role === "ADMIN";

	const meta = PAGE_META[location.pathname];

	const handleToggle = (next: AppMode) => {
		if (next === mode) return;
		setMode(next);
		const target = next === "admin" ? "/admin/dashboard" : "/";
		void navigate({ to: target });
	};

	return (
		<header className={styles.header}>
			{meta ? (
				<div className={styles.titleGroup}>
					<meta.icon size={16} className={styles.titleIcon} />
					<span className={styles.title}>{meta.title}</span>
				</div>
			) : (
				<span className={styles.title}>Flowvy</span>
			)}
			{isAdmin && (
				<div className={styles.toggle}>
					<button
						type="button"
						className={`${styles.toggleBtn} ${mode === "user" ? styles.activeBtn : ""}`}
						onClick={() => handleToggle("user")}
						aria-label="User mode"
					>
						<User size={16} />
					</button>
					<button
						type="button"
						className={`${styles.toggleBtn} ${mode === "admin" ? styles.activeBtn : ""}`}
						onClick={() => handleToggle("admin")}
						aria-label="Admin mode"
					>
						<UserStar size={16} />
					</button>
				</div>
			)}
		</header>
	);
}
