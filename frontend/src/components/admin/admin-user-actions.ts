import i18n from "../../i18n";
import { getAdminUserDisplayName } from "../../lib/admin-user-identity.ts";
import type { AdminUser } from "../../types/admin-users.ts";

export type UserAction = "enable" | "disable" | "reset" | "revoke" | "delete";

export interface ActionDef {
	key: UserAction;
	label: string;
	title: string;
	desc: string;
	confirmLabel: string;
	danger: boolean;
}

export function getActions(user: AdminUser): ActionDef[] {
	const isActive = user.status === "ACTIVE";
	const displayName = getAdminUserDisplayName(user);
	const statusAction: ActionDef[] =
		user.status === "UNKNOWN"
			? []
			: [
					{
						key: isActive ? "disable" : "enable",
						label: isActive ? i18n.t("admin.actions.disable") : i18n.t("admin.actions.enable"),
						title: isActive
							? i18n.t("admin.actions.disableTitle")
							: i18n.t("admin.actions.enableTitle"),
						desc: isActive
							? i18n.t("admin.actions.disableDesc", { username: displayName })
							: i18n.t("admin.actions.enableDesc", { username: displayName }),
						confirmLabel: isActive
							? i18n.t("admin.actions.disable")
							: i18n.t("admin.actions.enable"),
						danger: isActive,
					},
				];
	return [
		...statusAction,
		{
			key: "reset",
			label: i18n.t("admin.actions.resetTraffic"),
			title: i18n.t("admin.actions.resetTrafficTitle"),
			desc: i18n.t("admin.actions.resetTrafficDesc", { username: displayName }),
			confirmLabel: i18n.t("admin.actions.resetConfirm"),
			danger: false,
		},
		{
			key: "revoke",
			label: i18n.t("admin.actions.revoke"),
			title: i18n.t("admin.actions.revokeTitle"),
			desc: i18n.t("admin.actions.revokeDesc", { username: displayName }),
			confirmLabel: i18n.t("admin.actions.revokeConfirm"),
			danger: true,
		},
		{
			key: "delete",
			label: i18n.t("admin.actions.delete"),
			title: i18n.t("admin.actions.deleteTitle"),
			desc: i18n.t("admin.actions.deleteDesc", { username: displayName }),
			confirmLabel: i18n.t("admin.actions.deleteConfirm"),
			danger: true,
		},
	];
}
