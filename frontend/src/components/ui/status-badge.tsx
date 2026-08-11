import { useTranslation } from "react-i18next";
import type { UserStatus } from "../../types/user-status.ts";
import styles from "./status-badge.module.css";

const STATUS_CLASS: Record<UserStatus, string> = {
	ACTIVE: styles.active,
	LIMITED: styles.limited,
	DISABLED: styles.disabled,
	EXPIRED: styles.expired,
	UNKNOWN: styles.unknown,
};

export type StatusLabelContext = "subscription" | "user";

const STATUS_LABEL: Record<StatusLabelContext, Record<UserStatus, string>> = {
	subscription: {
		ACTIVE: "common.status.subscription.active",
		LIMITED: "common.status.subscription.limited",
		DISABLED: "common.status.subscription.disabled",
		EXPIRED: "common.status.subscription.expired",
		UNKNOWN: "common.status.subscription.unknown",
	},
	user: {
		ACTIVE: "common.status.user.active",
		LIMITED: "common.status.user.limited",
		DISABLED: "common.status.user.disabled",
		EXPIRED: "common.status.user.expired",
		UNKNOWN: "common.status.user.unknown",
	},
};

interface StatusBadgeProps {
	status: UserStatus;
	context: StatusLabelContext;
}

export function getStatusLabelKey(status: UserStatus, context: StatusLabelContext): string {
	return STATUS_LABEL[context][status];
}

export function StatusBadge({ status, context }: StatusBadgeProps) {
	const { t } = useTranslation();
	return (
		<span className={`${styles.badge} ${STATUS_CLASS[status]}`}>
			{t(getStatusLabelKey(status, context))}
		</span>
	);
}
