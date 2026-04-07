import { Loader2, UserX, X } from "lucide-react";
import { type FC, type KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { UserRow } from "../../components/admin/user-row.tsx";
import { useAdminUsers, useSearchUser } from "../../hooks/use-admin-users.ts";
import type { AdminUser } from "../../types/admin-users.ts";
import { UserDetailView } from "./user-detail.tsx";
import styles from "./users.module.css";

const PAGE_SIZE = 25;

type View = "list" | "detail";

export const AdminUsers: FC = () => {
	const [view, setView] = useState<View>("list");
	const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);

	const handleSelectUser = useCallback((user: AdminUser) => {
		setSelectedUser(user);
		setView("detail");
	}, []);

	const handleBack = useCallback(() => {
		setView("list");
		setSelectedUser(null);
	}, []);

	if (view === "detail" && selectedUser) {
		return <UserDetailView user={selectedUser} onBack={handleBack} />;
	}

	return <UserListView onSelectUser={handleSelectUser} />;
};

/* ── List View ── */

interface UserListViewProps {
	onSelectUser: (user: AdminUser) => void;
}

const UserListView: FC<UserListViewProps> = ({ onSelectUser }) => {
	const [start, setStart] = useState(0);
	const [allUsers, setAllUsers] = useState<AdminUser[]>([]);
	const [searchInput, setSearchInput] = useState("");
	const [searchQuery, setSearchQuery] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);
	const { t } = useTranslation();

	const list = useAdminUsers(PAGE_SIZE, start);
	const search = useSearchUser(searchQuery);

	const isSearchMode = searchQuery.length > 0;

	// Accumulate users across pages
	useEffect(() => {
		const users = list.data?.users;
		if (users && !isSearchMode) {
			setAllUsers((prev) => {
				if (start === 0) return users;
				const existing = new Set(prev.map((u) => u.uuid));
				const fresh = users.filter((u) => !existing.has(u.uuid));
				return [...prev, ...fresh];
			});
		}
	}, [list.data, start, isSearchMode]);

	const handleSearch = useCallback(
		(e: KeyboardEvent<HTMLInputElement>) => {
			if (e.key === "Enter") {
				const q = searchInput.trim();
				if (q) setSearchQuery(q);
			}
		},
		[searchInput],
	);

	const handleClear = useCallback(() => {
		setSearchInput("");
		setSearchQuery("");
		inputRef.current?.focus();
	}, []);

	const handleLoadMore = useCallback(() => {
		setStart((prev) => prev + PAGE_SIZE);
	}, []);

	const total = list.data?.total ?? 0;
	const displayUsers = isSearchMode ? (search.data?.users ?? []) : allUsers;
	const hasMore = !isSearchMode && total > 0 && start + PAGE_SIZE < total;

	if (!isSearchMode && list.isPending && allUsers.length === 0) {
		return (
			<div className={styles.page}>
				<div className={styles.empty}>
					<Loader2 size={24} className={styles.emptyIcon} />
				</div>
			</div>
		);
	}

	if (!isSearchMode && list.error && allUsers.length === 0) {
		return (
			<div className={styles.page}>
				<div className={styles.empty}>
					<span className={styles.emptyTitle}>{t('admin.users.error')}</span>
				</div>
			</div>
		);
	}

	return (
		<div className={styles.page}>
			<div className={styles.header}>
				<h1 className={styles.headerTitle}>{t('admin.users.title')}</h1>
				{total > 0 && <span className={styles.headerCount}>{total}</span>}
			</div>

			<div className={styles.searchWrap}>
				<input
					ref={inputRef}
					type="text"
					value={searchInput}
					onChange={(e) => setSearchInput(e.target.value)}
					onKeyDown={handleSearch}
					placeholder={t('admin.users.searchPlaceholder')}
					className={styles.searchInput}
				/>
				{isSearchMode && (
					<button
						type="button"
						className={styles.clearBtn}
						onClick={handleClear}
						aria-label={t('admin.users.clearSearchLabel')}
					>
						<X size={12} />
					</button>
				)}
			</div>

			{isSearchMode && search.isPending && (
				<div className={styles.empty}>
					<Loader2 size={24} className={styles.emptyIcon} />
				</div>
			)}

			{isSearchMode && search.error && (
				<div className={styles.empty}>
					<span className={styles.emptyTitle}>{t('admin.users.searchFailed')}</span>
				</div>
			)}

			{isSearchMode && !search.isPending && displayUsers.length === 0 && (
				<div className={styles.empty}>
					<UserX size={36} className={styles.emptyIcon} />
					<span className={styles.emptyTitle}>{t('admin.users.notFound')}</span>
					<span className={styles.emptyDesc}>{t('admin.users.notFoundDesc')}</span>
				</div>
			)}

			{displayUsers.length > 0 && (
				<div className={styles.list}>
					{displayUsers.map((user) => (
						<div key={user.uuid} className={styles.card}>
							<UserRow user={user} onClick={() => onSelectUser(user)} />
						</div>
					))}
				</div>
			)}

			{hasMore && (
				<button
					type="button"
					className={styles.loadMore}
					onClick={handleLoadMore}
					disabled={list.isPending}
				>
					{list.isPending ? t('admin.users.loadingMore') : t('admin.users.loadMore')}
				</button>
			)}
		</div>
	);
};
