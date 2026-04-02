/**
 * App header — shows title and admin/user mode toggle.
 */
import { useNavigate } from "@tanstack/react-router";
import { User, UserStar } from "lucide-react";
import { type AppMode, useMode } from "../../contexts/mode-context.tsx";
import { useCurrentUser } from "../auth-guard.tsx";
import styles from "./header.module.css";

export function Header() {
	const user = useCurrentUser();
	const { mode, setMode } = useMode();
	const navigate = useNavigate();
	const isAdmin = user.role === "ADMIN";

	const handleToggle = (next: AppMode) => {
		if (next === mode) return;
		setMode(next);
		const target = next === "admin" ? "/admin/dashboard" : "/";
		void navigate({ to: target });
	};

	return (
		<header className={styles.header}>
			<span className={styles.title}>Flowvy</span>
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
