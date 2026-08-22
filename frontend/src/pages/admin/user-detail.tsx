/**
 * Admin user detail view — drill-down from user list.
 * Shows hero card + detail rows with action buttons.
 */
import { type FC, useState } from "react";
import { useTranslation } from "react-i18next";
import type { UserAction } from "../../components/admin/admin-user-actions.ts";
import { AdminUserDetail } from "../../components/admin/admin-user-detail.tsx";
import { AdminUserHero } from "../../components/admin/admin-user-hero.tsx";
import { InlineFeedback } from "../../components/ui/inline-feedback.tsx";
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
	onDeleted: () => void;
}

export const UserDetailView: FC<UserDetailViewProps> = ({ user, onDeleted }) => {
	const { t } = useTranslation();
	const [actionLoading, setActionLoading] = useState<UserAction | null>(null);
	const [actionFailed, setActionFailed] = useState(false);
	const enableMut = useEnableUser();
	const disableMut = useDisableUser();
	const resetMut = useResetTraffic();
	const revokeMut = useRevokeSubscription();
	const deleteMut = useDeleteUser();

	const handleAction = async (key: UserAction) => {
		setActionFailed(false);
		setActionLoading(key);
		try {
			if (key === "enable") await enableMut.enable(user.id);
			else if (key === "disable") await disableMut.disable(user.id);
			else if (key === "reset") await resetMut.reset(user.id);
			else if (key === "revoke") await revokeMut.revoke(user.id);
			else if (key === "delete") {
				await deleteMut.remove(user.id);
				onDeleted();
				return;
			}
		} catch {
			setActionFailed(true);
		} finally {
			setActionLoading(null);
		}
	};

	return (
		<div className={styles.detailPage}>
			{actionFailed && (
				<InlineFeedback attention="action">{t("admin.actions.error")}</InlineFeedback>
			)}
			<AdminUserHero user={user} onAction={handleAction} actionLoading={actionLoading} />
			<AdminUserDetail user={user} />
		</div>
	);
};
