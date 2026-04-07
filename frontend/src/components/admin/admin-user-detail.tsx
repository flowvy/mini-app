/**
 * Admin user detail — account info, squads, and connection rows.
 * Follows Desktop DetailRows.tsx pattern.
 */
import type { FC } from "react";
import {
	formatDateISO,
	formatLastSeen,
	isUnlimitedDevices,
	isUnlimitedExpiryISO,
} from "../../lib/format.ts";
import type { AdminUser } from "../../types/admin-users.ts";
import styles from "./admin-user-detail.module.css";

interface AdminUserDetailProps {
	user: AdminUser;
}

function Row({
	label,
	value,
	mono,
	muted,
}: {
	label: string;
	value: string | null | undefined;
	mono?: boolean;
	muted?: boolean;
}) {
	const display = value ?? "\u2014";
	const cls = [styles.rowValue, muted || !value ? styles.rowMuted : "", mono ? styles.rowMono : ""]
		.filter(Boolean)
		.join(" ");

	return (
		<div className={styles.sectionRow}>
			<span className={styles.rowLabel}>{label}</span>
			<span className={cls}>{display}</span>
		</div>
	);
}

function SectionDivider({ children, first }: { children: string; first?: boolean }) {
	const cls = [styles.sectionDivider, first ? styles.sectionDividerFirst : ""]
		.filter(Boolean)
		.join(" ");
	return <div className={cls}>{children}</div>;
}

export const AdminUserDetail: FC<AdminUserDetailProps> = ({ user }) => {
	const ut = user.userTraffic;
	const internalSquads = user.activeInternalSquads?.map((sq) => sq.name.trim()).join(", ");

	return (
		<div className={styles.sectionBody}>
			<SectionDivider first>Account Info</SectionDivider>
			<Row label="Created" value={formatDateISO(user.createdAt)} mono />
			<Row
				label="Expires"
				value={isUnlimitedExpiryISO(user.expireAt) ? "Unlimited" : formatDateISO(user.expireAt)}
				mono
			/>
			<Row label="Email" value={user.email} mono muted={!user.email} />
			<Row label="Telegram ID" value={user.telegramId ? String(user.telegramId) : null} mono />
			<Row
				label="Devices"
				value={
					isUnlimitedDevices(user.hwidDeviceLimit) ? "Unlimited" : `${user.hwidDeviceLimit} devices`
				}
				mono
			/>
			<Row label="Tag" value={user.tag} muted={!user.tag} />
			<Row label="Description" value={user.description} muted={!user.description} />

			<SectionDivider>Squads</SectionDivider>
			<Row label="Internal" value={internalSquads || null} muted={!internalSquads} />
			<Row label="External" value={user.externalSquadName} muted={!user.externalSquadName} />

			<SectionDivider>Connection</SectionDivider>
			<Row
				label="First connected"
				value={formatDateISO(ut.firstConnectedAt)}
				mono
				muted={!ut.firstConnectedAt}
			/>
			<Row
				label="Last seen"
				value={ut.onlineAt ? formatLastSeen(ut.onlineAt) : null}
				mono
				muted={!ut.onlineAt}
			/>
		</div>
	);
};
