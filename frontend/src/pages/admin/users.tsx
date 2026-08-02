import { useNavigate } from "@tanstack/react-router";
import { UserX, X } from "lucide-react";
import { type FC, useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FILTER_KEYS, FilterChips, type FilterKey } from "../../components/admin/filter-chips.tsx";
import { VirtualizedUserList } from "../../components/admin/virtualized-user-list.tsx";
import { LoadErrorState } from "../../components/ui/load-error-state.tsx";
import { useAllAdminUsers } from "../../hooks/use-all-admin-users.ts";
import { dismissKeyboardOnEnter } from "../../lib/keyboard.ts";
import type { AdminUser } from "../../types/admin-users.ts";
import { UsersListSkeleton } from "./users-skeleton.tsx";
import styles from "./users.module.css";

const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;

function isOnline(onlineAt: string | null | undefined): boolean {
	if (!onlineAt) return false;
	return Date.now() - new Date(onlineAt).getTime() < ONLINE_THRESHOLD_MS;
}

function emptyCounts(): Record<FilterKey, number> {
	return FILTER_KEYS.reduce(
		(acc, k) => {
			acc[k] = 0;
			return acc;
		},
		{} as Record<FilterKey, number>,
	);
}

function onlineTs(user: AdminUser): number {
	return user.userTraffic.onlineAt ? new Date(user.userTraffic.onlineAt).getTime() : 0;
}

export const AdminUsers: FC = () => {
	const navigate = useNavigate();
	const { t } = useTranslation();
	const { data, isPending, error, refetch } = useAllAdminUsers();
	const [searchInput, setSearchInput] = useState("");
	const [filter, setFilter] = useState<FilterKey>("ALL");
	const inputRef = useRef<HTMLInputElement>(null);

	const allUsers = data?.users;

	const counts = useMemo<Record<FilterKey, number>>(() => {
		const c = emptyCounts();
		if (!allUsers) return c;
		for (const u of allUsers) {
			c.ALL++;
			if (u.status === "ACTIVE") c.ACTIVE++;
			else if (u.status === "DISABLED") c.DISABLED++;
			else if (u.status === "LIMITED") c.LIMITED++;
			else if (u.status === "EXPIRED") c.EXPIRED++;
			if (isOnline(u.userTraffic.onlineAt)) c.ONLINE++;
		}
		return c;
	}, [allUsers]);

	const filtered = useMemo<AdminUser[]>(() => {
		if (!allUsers) return [];
		let list: AdminUser[] = allUsers;
		if (filter === "ONLINE") list = list.filter((u) => isOnline(u.userTraffic.onlineAt));
		else if (filter !== "ALL") list = list.filter((u) => u.status === filter);

		const q = searchInput.trim().toLowerCase();
		if (q) {
			list = list.filter((u) => {
				if (u.username.toLowerCase().includes(q)) return true;
				if (u.tag?.toLowerCase().includes(q)) return true;
				if (u.telegramId && String(u.telegramId).includes(q)) return true;
				return false;
			});
		}

		return [...list].sort((a, b) => onlineTs(b) - onlineTs(a));
	}, [allUsers, filter, searchInput]);

	const handleUserClick = useCallback(
		(id: number) => {
			navigate({ to: "/admin/users/$userId", params: { userId: String(id) } });
		},
		[navigate],
	);

	const handleClear = useCallback(() => {
		setSearchInput("");
		inputRef.current?.focus();
	}, []);

	if (isPending) return <UsersListSkeleton />;

	if (error) {
		return <LoadErrorState onRetry={refetch} />;
	}

	return (
		<div className={styles.page}>
			<div className={styles.searchBlock}>
				<div className={styles.searchWrap}>
					<input
						ref={inputRef}
						type="text"
						value={searchInput}
						onChange={(e) => setSearchInput(e.target.value)}
						onKeyDown={dismissKeyboardOnEnter}
						placeholder={t("admin.users.searchPlaceholder")}
						enterKeyHint="search"
						inputMode="search"
						className={styles.searchInput}
						aria-label={t("admin.users.searchLabel")}
					/>
					{searchInput && (
						<button
							type="button"
							className={styles.clearBtn}
							onClick={handleClear}
							aria-label={t("admin.users.clearSearchLabel")}
						>
							<X size={12} />
						</button>
					)}
				</div>
				<FilterChips active={filter} onChange={setFilter} counts={counts} />
			</div>

			{filtered.length === 0 ? (
				<div className={styles.empty}>
					<UserX size={36} className={styles.emptyIcon} />
					<span className={styles.emptyTitle}>{t("admin.users.empty.title")}</span>
					<span className={styles.emptyDesc}>{t("admin.users.empty.description")}</span>
				</div>
			) : (
				<VirtualizedUserList users={filtered} onUserClick={handleUserClick} />
			)}
		</div>
	);
};
