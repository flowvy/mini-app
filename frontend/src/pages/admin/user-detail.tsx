/**
 * Admin user detail view — drill-down from user list.
 * Shows hero card + detail rows with action buttons.
 */
import { ArrowLeft } from "lucide-react";
import { type FC, useState } from "react";
import type { UserAction } from "../../components/admin/admin-user-actions.ts";
import { AdminUserDetail } from "../../components/admin/admin-user-detail.tsx";
import { AdminUserHero } from "../../components/admin/admin-user-hero.tsx";
import { StatusBadge } from "../../components/ui/status-badge.tsx";
import {
	useDeleteUser,
	useDisableUser,
	useEnableUser,
	useResetTraffic,
	useRevokeSubscription,
} from "../../hooks/use-admin-users.ts";
import type { AdminUser } from "../../types/admin-users.ts";
import styles from "./users.module.css";

interface UserDetailViewProps {
	user: AdminUser;
	onBack: () => void;
}

export const UserDetailView: FC<UserDetailViewProps> = ({ user, onBack }) => {
	const [actionLoading, setActionLoading] = useState<UserAction | null>(null);
	const enableMut = useEnableUser();
	const disableMut = useDisableUser();
	const resetMut = useResetTraffic();
	const revokeMut = useRevokeSubscription();
	const deleteMut = useDeleteUser();

	const handleAction = async (key: UserAction) => {
		setActionLoading(key);
		try {
			if (key === "enable") await enableMut.enable(user.uuid);
			else if (key === "disable") await disableMut.disable(user.uuid);
			else if (key === "reset") await resetMut.reset(user.uuid);
			else if (key === "revoke") await revokeMut.revoke(user.uuid);
			else if (key === "delete") {
				await deleteMut.remove(user.uuid);
				onBack();
				return;
			}
		} finally {
			setActionLoading(null);
		}
	};

	return (
		<div className={styles.detailPage}>
			<div className={styles.detailHeader}>
				<button type="button" className={styles.backBtn} onClick={onBack}>
					<ArrowLeft size={16} />
				</button>
				<h1 className={styles.detailTitle}>{user.username}</h1>
				<StatusBadge status={user.status} />
			</div>
			<AdminUserHero user={user} onAction={handleAction} actionLoading={actionLoading} />
			<AdminUserDetail user={user} />
		</div>
	);
};
