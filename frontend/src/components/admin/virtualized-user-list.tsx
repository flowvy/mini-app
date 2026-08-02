import { useElementScrollRestoration } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { type FC, memo, useCallback, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AdminUser } from "../../types/admin-users.ts";
import { UserRow } from "./user-row.tsx";
import styles from "./virtualized-user-list.module.css";

interface VirtualizedUserListProps {
	users: AdminUser[];
	onUserClick: (id: number) => void;
}

interface RowProps {
	user: AdminUser;
	onUserClick: (id: number) => void;
}

const Row = memo(function Row({ user, onUserClick }: RowProps) {
	const handle = useCallback(() => onUserClick(user.id), [user.id, onUserClick]);
	return (
		<div className={styles.card}>
			<UserRow user={user} onClick={handle} />
		</div>
	);
});

export const VirtualizedUserList: FC<VirtualizedUserListProps> = ({ users, onUserClick }) => {
	const { t } = useTranslation();
	const scrollEntry = useElementScrollRestoration({ id: "main-content" });
	const listRef = useRef<HTMLUListElement>(null);

	const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);
	useLayoutEffect(() => {
		setScrollEl(document.querySelector<HTMLElement>('[data-scroll-restoration-id="main-content"]'));
	}, []);

	const [scrollMargin, setScrollMargin] = useState(0);
	useLayoutEffect(() => {
		if (!listRef.current || !scrollEl) return;
		const listTop = listRef.current.getBoundingClientRect().top;
		const scrollTop = scrollEl.getBoundingClientRect().top;
		setScrollMargin(listTop - scrollTop + scrollEl.scrollTop);
	}, [scrollEl]);

	const virtualizer = useVirtualizer({
		count: users.length,
		getScrollElement: () => scrollEl,
		estimateSize: () => 66,
		overscan: 5,
		useFlushSync: false,
		scrollMargin,
		initialOffset: scrollEntry?.scrollY ?? 0,
		getItemKey: useCallback((index: number) => users[index].id, [users]),
	});

	const virtualItems = virtualizer.getVirtualItems();
	const totalSize = virtualizer.getTotalSize();

	return (
		<ul
			ref={listRef}
			className={styles.list}
			aria-rowcount={users.length}
			aria-label={t("admin.users.listLabel")}
		>
			<div className={styles.inner} style={{ height: `${totalSize}px` }}>
				{virtualItems.map((virtualRow) => (
					<li
						key={virtualRow.key}
						data-index={virtualRow.index}
						aria-rowindex={virtualRow.index + 1}
						className={styles.item}
						style={{
							height: `${virtualRow.size}px`,
							transform: `translateY(${virtualRow.start - scrollMargin}px)`,
						}}
					>
						<Row user={users[virtualRow.index]} onUserClick={onUserClick} />
					</li>
				))}
			</div>
		</ul>
	);
};
