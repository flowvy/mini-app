import i18n from "../../i18n";
/**
 * Action definitions for the admin user hero card.
 * Each action maps to a ConfirmDialog with label, description, and danger flag.
 */
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
	return [
		{
			key: isActive ? "disable" : "enable",
			label: isActive ? i18n.t("admin.actions.disable") : i18n.t("admin.actions.enable"),
			title: isActive ? i18n.t("admin.actions.disableTitle") : i18n.t("admin.actions.enableTitle"),
			desc: isActive
				? i18n.t("admin.actions.disableDesc", { username: user.username })
				: i18n.t("admin.actions.enableDesc", { username: user.username }),
			confirmLabel: isActive ? i18n.t("admin.actions.disable") : i18n.t("admin.actions.enable"),
			danger: isActive,
		},
		{
			key: "reset",
			label: i18n.t("admin.actions.resetTraffic"),
			title: i18n.t("admin.actions.resetTrafficTitle"),
			desc: i18n.t("admin.actions.resetTrafficDesc", { username: user.username }),
			confirmLabel: i18n.t("admin.actions.resetConfirm"),
			danger: false,
		},
		{
			key: "revoke",
			label: i18n.t("admin.actions.revoke"),
			title: i18n.t("admin.actions.revokeTitle"),
			desc: i18n.t("admin.actions.revokeDesc", { username: user.username }),
			confirmLabel: i18n.t("admin.actions.revokeConfirm"),
			danger: true,
		},
		{
			key: "delete",
			label: i18n.t("admin.actions.delete"),
			title: i18n.t("admin.actions.deleteTitle"),
			desc: i18n.t("admin.actions.deleteDesc", { username: user.username }),
			confirmLabel: i18n.t("admin.actions.deleteConfirm"),
			danger: true,
		},
	];
}
