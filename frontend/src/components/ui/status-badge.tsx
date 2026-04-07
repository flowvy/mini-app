import { useTranslation } from "react-i18next";
import type { SubscriptionStatus } from "../../types/subscription.ts";
import styles from "./status-badge.module.css";

const STATUS_CLASS: Record<SubscriptionStatus, string> = {
	ACTIVE: styles.active,
	LIMITED: styles.limited,
	DISABLED: styles.disabled,
	EXPIRED: styles.expired,
};

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
	ACTIVE: "common.status.active",
	LIMITED: "common.status.limited",
	DISABLED: "common.status.disabled",
	EXPIRED: "common.status.expired",
};

interface StatusBadgeProps {
	status: SubscriptionStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
	const { t } = useTranslation();
	return <span className={`${styles.badge} ${STATUS_CLASS[status]}`}>{t(STATUS_LABEL[status])}</span>;
}
