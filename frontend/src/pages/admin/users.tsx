import { useNavigate } from "@tanstack/react-router";
import { UserX, X } from "lucide-react";
import { type FC, type KeyboardEvent, useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { UserRow } from "../../components/admin/user-row.tsx";
import { SpinnerIcon } from "../../components/ui/spinner-icon.tsx";
import { useAdminUsers, useSearchUser } from "../../hooks/use-admin-users.ts";
import type { AdminUser } from "../../types/admin-users.ts";
import { UsersListSkeleton } from "./users-skeleton.tsx";
import styles from "./users.module.css";

export const AdminUsers: FC = () => {
	const navigate = useNavigate();
	const [searchInput, setSearchInput] = useState("");
	const [searchQuery, setSearchQuery] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);
	const { t } = useTranslation();

	const list = useAdminUsers();
	const search = useSearchUser(searchQuery);

	const isSearchMode = searchQuery.length > 0;
	const allUsers = list.data?.pages.flatMap((p) => p.users) ?? [];

	const handleSelectUser = useCallback(
		(user: AdminUser) => {
			navigate({ to: "/admin/users/$userId", params: { userId: user.uuid } });
		},
		[navigate],
	);

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

	const displayUsers = isSearchMode ? (search.data?.users ?? []) : allUsers;
	const hasMore = !isSearchMode && list.hasNextPage;

	if (!isSearchMode && list.isPending && allUsers.length === 0) {
		return <UsersListSkeleton />;
	}

	if (!isSearchMode && list.error && allUsers.length === 0) {
		return (
			<div className={styles.page}>
				<div className={styles.empty}>
					<span className={styles.emptyTitle}>{t("admin.users.error")}</span>
				</div>
			</div>
		);
	}

	return (
		<div className={styles.page}>
			<div className={styles.searchWrap}>
				<input
					ref={inputRef}
					type="text"
					value={searchInput}
					onChange={(e) => setSearchInput(e.target.value)}
					onKeyDown={handleSearch}
					placeholder={t("admin.users.searchPlaceholder")}
					className={styles.searchInput}
				/>
				{isSearchMode && (
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

			{isSearchMode && search.isPending && (
				<div className={styles.empty}>
					<SpinnerIcon size={24} color="var(--v2-text-tertiary)" />
				</div>
			)}

			{isSearchMode && search.error && (
				<div className={styles.empty}>
					<span className={styles.emptyTitle}>{t("admin.users.searchFailed")}</span>
				</div>
			)}

			{isSearchMode && !search.isPending && displayUsers.length === 0 && (
				<div className={styles.empty}>
					<UserX size={36} className={styles.emptyIcon} />
					<span className={styles.emptyTitle}>{t("admin.users.notFound")}</span>
					<span className={styles.emptyDesc}>{t("admin.users.notFoundDesc")}</span>
				</div>
			)}

			{displayUsers.length > 0 && (
				<div className={styles.list}>
					{displayUsers.map((user) => (
						<div key={user.uuid} className={styles.card}>
							<UserRow user={user} onClick={() => handleSelectUser(user)} />
						</div>
					))}
				</div>
			)}

			{hasMore && (
				<button
					type="button"
					className={styles.loadMore}
					onClick={() => list.fetchNextPage()}
					disabled={list.isFetchingNextPage}
				>
					{list.isFetchingNextPage ? (
						<SpinnerIcon size={12} color="var(--v2-text-secondary)" />
					) : (
						t("admin.users.loadMore")
					)}
				</button>
			)}
		</div>
	);
};
