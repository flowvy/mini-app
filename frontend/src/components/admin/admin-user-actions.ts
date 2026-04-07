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
			label: isActive ? "Disable" : "Enable",
			title: isActive ? "Disable user?" : "Enable user?",
			desc: isActive
				? `${user.username} will lose VPN access.`
				: `${user.username} will regain VPN access.`,
			confirmLabel: isActive ? "Disable" : "Enable",
			danger: isActive,
		},
		{
			key: "reset",
			label: "Reset traffic",
			title: "Reset traffic?",
			desc: `Traffic counter for ${user.username} will be set to zero.`,
			confirmLabel: "Reset",
			danger: false,
		},
		{
			key: "revoke",
			label: "Revoke",
			title: "Revoke subscription?",
			desc: `Subscription link for ${user.username} will stop working.`,
			confirmLabel: "Revoke",
			danger: true,
		},
		{
			key: "delete",
			label: "Delete",
			title: "Delete user?",
			desc: `${user.username} will be permanently deleted. This cannot be undone.`,
			confirmLabel: "Delete",
			danger: true,
		},
	];
}
