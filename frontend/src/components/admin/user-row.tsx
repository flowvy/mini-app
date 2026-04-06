import { ChevronRight } from "lucide-react";
import type { FC } from "react";
import {
	formatAdminExpiry,
	formatLastSeen,
	formatTrafficPair,
	getAdminExpiryColor,
	getTrafficColor,
	getTrafficPercent,
} from "../../lib/format.ts";
import type { AdminUser } from "../../types/admin-users.ts";
import { StatusBadge } from "../ui/status-badge.tsx";
import styles from "./user-row.module.css";

interface UserRowProps {
	user: AdminUser;
}

export const UserRow: FC<UserRowProps> = ({ user }) => {
	const used = user.userTraffic.usedTrafficBytes;
	const limit = user.trafficLimitBytes;
	const pct = getTrafficPercent(used, limit);
	const expiryText = formatAdminExpiry(user.expireAt);
	const expiryColor = getAdminExpiryColor(user.expireAt);

	const parts: string[] = [];
	if (user.tag) parts.push(user.tag);
	parts.push(formatTrafficPair(used, limit));
	parts.push(formatLastSeen(user.userTraffic.onlineAt));

	return (
		<div className={styles.row}>
			<div className={styles.rowContent}>
				<div className={styles.line1}>
					<span className={styles.username}>{user.username}</span>
					<StatusBadge status={user.status} />
					<div className={styles.rightGroup}>
						{limit > 0 && (
							<div className={styles.trafficBar}>
								<div
									className={styles.trafficBarFill}
									style={{
										width: `${pct}%`,
										background: getTrafficColor(pct),
									}}
								/>
							</div>
						)}
						<ChevronRight size={14} className={styles.chevron} />
					</div>
				</div>

				<div className={styles.line2}>
					<span className={styles.meta}>{parts.join(" \u00B7 ")}</span>
					{expiryText !== "\u221E" && (
						<span
							className={styles.expiry}
							style={{ color: expiryColor ?? "var(--v2-text-tertiary)" }}
						>
							{expiryText}
						</span>
					)}
				</div>
			</div>
		</div>
	);
};
