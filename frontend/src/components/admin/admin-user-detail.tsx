import type { FC } from "react";
import { useTranslation } from "react-i18next";
import {
	formatDateISO,
	formatExpiryDate,
	formatLastSeen,
	formatMetaList,
	formatMissing,
	isUnlimitedDevices,
} from "../../lib/format.ts";
import type { AdminUser } from "../../types/admin-users.ts";
import { FormRowSeparator, FormSection, FormSectionCard } from "../ui/form-section.tsx";
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
	const display = value ?? formatMissing();
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

export const AdminUserDetail: FC<AdminUserDetailProps> = ({ user }) => {
	const { t } = useTranslation();
	const ut = user.userTraffic;
	const internalSquads = formatMetaList(
		user.activeInternalSquads?.map((sq) => sq.name.trim()) ?? [],
	);

	return (
		<div className={styles.sections}>
			<FormSection title={t("admin.userDetail.referrals")}>
				<FormSectionCard>
					<Row label={t("admin.userDetail.invitedUsers")} value={String(user.invitedCount)} mono />
				</FormSectionCard>
			</FormSection>

			<FormSection title={t("admin.userDetail.accountInfo")}>
				<FormSectionCard>
					<Row label={t("admin.userDetail.created")} value={formatDateISO(user.createdAt)} mono />
					<FormRowSeparator />
					<Row label={t("admin.userDetail.expires")} value={formatExpiryDate(user.expireAt)} mono />
					<FormRowSeparator />
					<Row label={t("admin.userDetail.email")} value={user.email} mono muted={!user.email} />
					<FormRowSeparator />
					<Row
						label={t("admin.userDetail.telegramId")}
						value={user.telegramId ? String(user.telegramId) : null}
						mono
					/>
					<FormRowSeparator />
					<Row
						label={t("admin.userDetail.devices")}
						value={
							isUnlimitedDevices(user.hwidDeviceLimit)
								? t("admin.userDetail.devicesUnlimited")
								: t("admin.userDetail.devicesCount", { n: user.hwidDeviceLimit })
						}
						mono
					/>
					<FormRowSeparator />
					<Row label={t("admin.userDetail.tag")} value={user.tag} muted={!user.tag} />
					<FormRowSeparator />
					<Row
						label={t("admin.userDetail.description")}
						value={user.description}
						muted={!user.description}
					/>
				</FormSectionCard>
			</FormSection>

			<FormSection title={t("admin.userDetail.squads")}>
				<FormSectionCard>
					<Row
						label={t("admin.userDetail.internal")}
						value={internalSquads || null}
						muted={!internalSquads}
					/>
					<FormRowSeparator />
					<Row
						label={t("admin.userDetail.external")}
						value={user.externalSquadName}
						muted={!user.externalSquadName}
					/>
				</FormSectionCard>
			</FormSection>

			<FormSection title={t("admin.userDetail.connection")}>
				<FormSectionCard>
					<Row
						label={t("admin.userDetail.firstConnected")}
						value={formatDateISO(ut.firstConnectedAt)}
						mono
						muted={!ut.firstConnectedAt}
					/>
					<FormRowSeparator />
					<Row
						label={t("admin.userDetail.lastSeen")}
						value={ut.onlineAt ? formatLastSeen(ut.onlineAt) : null}
						mono
						muted={!ut.onlineAt}
					/>
				</FormSectionCard>
			</FormSection>
		</div>
	);
};
