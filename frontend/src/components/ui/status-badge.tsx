import type { SubscriptionStatus } from "../../types/subscription.ts";
import styles from "./status-badge.module.css";

const STATUS_CLASS: Record<SubscriptionStatus, string> = {
	ACTIVE: styles.active,
	LIMITED: styles.limited,
	DISABLED: styles.disabled,
	EXPIRED: styles.expired,
};

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
	ACTIVE: "Active",
	LIMITED: "Limited",
	DISABLED: "Disabled",
	EXPIRED: "Expired",
};

interface StatusBadgeProps {
	status: SubscriptionStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
	return <span className={`${styles.badge} ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span>;
}
