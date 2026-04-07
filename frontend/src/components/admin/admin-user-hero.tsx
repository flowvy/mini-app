/**
 * Admin user detail — hero card with traffic, KPIs, progress bar,
 * stats strip, and action buttons.
 */
import {
	Ban,
	CheckCircle,
	Infinity as InfinityIcon,
	RefreshCw,
	Trash2,
	Unlink,
} from "lucide-react";
import { type FC, useState } from "react";
import {
	formatExpiryCompact,
	formatLastSeen,
	formatResetStrategy,
	formatTraffic,
	getDaysLeftISO,
	getExpiryColorISO,
	getTrafficColor,
	getTrafficPercent,
	isUnlimitedDevices,
	isUnlimitedExpiryISO,
	isUnlimitedTraffic,
} from "../../lib/format.ts";
import type { AdminUser } from "../../types/admin-users.ts";
import type { ResetStrategy } from "../../types/subscription.ts";
import { ActionBtn } from "../ui/action-btn.tsx";
import { ConfirmDialog } from "../ui/confirm-dialog.tsx";
import { type ActionDef, type UserAction, getActions } from "./admin-user-actions.ts";
import styles from "./admin-user-hero.module.css";

interface AdminUserHeroProps {
	user: AdminUser;
	onAction: (key: UserAction) => void;
	actionLoading: UserAction | null;
}

const ACTION_ICONS: Record<string, React.ReactNode> = {
	enable: <CheckCircle size={13} />,
	disable: <Ban size={13} />,
	reset: <RefreshCw size={13} />,
	revoke: <Unlink size={13} />,
	delete: <Trash2 size={13} />,
};

export const AdminUserHero: FC<AdminUserHeroProps> = ({ user, onAction, actionLoading }) => {
	const ut = user.userTraffic;
	const unlTraffic = isUnlimitedTraffic(user.trafficLimitBytes);
	const unlExpiry = isUnlimitedExpiryISO(user.expireAt);
	const pct = unlTraffic ? 0 : getTrafficPercent(ut.usedTrafficBytes, user.trafficLimitBytes);
	const fillColor = getTrafficColor(pct);
	const daysLeft = getDaysLeftISO(user.expireAt);
	const expiryColor = unlExpiry ? undefined : getExpiryColorISO(daysLeft);

	const [confirm, setConfirm] = useState<ActionDef | null>(null);
	const actions = getActions(user);

	const handleConfirm = () => {
		if (confirm) {
			onAction(confirm.key);
			setConfirm(null);
		}
	};

	return (
		<>
			<div className={styles.hero}>
				<div className={styles.heroRow1}>
					<div className={styles.heroLeft}>
						{unlTraffic ? (
							<span className={styles.heroUsed}>Unlimited</span>
						) : (
							<>
								<span className={styles.heroUsed}>{formatTraffic(ut.usedTrafficBytes)}</span>
								<span className={styles.heroTotal}>/ {formatTraffic(user.trafficLimitBytes)}</span>
							</>
						)}
					</div>
					<div className={styles.heroRight}>
						<div className={styles.heroKpi}>
							<div
								className={styles.heroKpiValue}
								style={expiryColor ? { color: expiryColor } : undefined}
							>
								{unlExpiry ? <InfinityIcon size={16} /> : formatExpiryCompact(daysLeft)}
							</div>
							<div className={styles.heroKpiLabel}>Expires</div>
						</div>
						<div className={styles.heroDivider} />
						<div className={styles.heroKpi}>
							<div className={styles.heroKpiValue}>
								{isUnlimitedDevices(user.hwidDeviceLimit) ? (
									<InfinityIcon size={16} />
								) : (
									user.hwidDeviceLimit
								)}
							</div>
							<div className={styles.heroKpiLabel}>Devices</div>
						</div>
					</div>
				</div>

				{!unlTraffic && (
					<div>
						<div className={styles.heroBarTrack}>
							<div
								className={styles.heroBarFill}
								style={{ width: `${pct}%`, background: fillColor }}
							/>
						</div>
						<div className={styles.heroBarLabels}>
							<span className={styles.heroBarLabel}>
								<span className={styles.heroBarDot} style={{ background: fillColor }} />
								Used {Math.round(pct)}%
							</span>
							<span className={styles.heroBarLabel}>
								<span
									className={styles.heroBarDot}
									style={{ background: "var(--v2-bg-secondary)" }}
								/>
								{formatTraffic(user.trafficLimitBytes - ut.usedTrafficBytes)}
							</span>
						</div>
					</div>
				)}

				<div className={styles.heroStats}>
					<div className={styles.heroStat}>
						<div className={styles.heroStatValue}>
							{formatResetStrategy(user.trafficLimitStrategy as ResetStrategy)}
						</div>
						<div className={styles.heroStatLabel}>Traffic Reset</div>
					</div>
					<div className={styles.heroStat}>
						<div className={styles.heroStatValue}>{formatTraffic(ut.lifetimeUsedTrafficBytes)}</div>
						<div className={styles.heroStatLabel}>All Time</div>
					</div>
					<div className={styles.heroStat}>
						<div className={styles.heroStatValue}>{formatLastSeen(ut.onlineAt)}</div>
						<div className={styles.heroStatLabel}>Last Seen</div>
					</div>
				</div>

				<div className={styles.heroActions}>
					{actions.slice(0, 2).map((a) => (
						<ActionBtn
							key={a.key}
							variant="action"
							size="md"
							loading={actionLoading === a.key}
							onClick={() => setConfirm(a)}
						>
							{ACTION_ICONS[a.key]} {a.label}
						</ActionBtn>
					))}
				</div>
				<div className={styles.heroActionsRow}>
					{actions.slice(2).map((a) => (
						<ActionBtn
							key={a.key}
							variant="action"
							size="md"
							loading={actionLoading === a.key}
							onClick={() => setConfirm(a)}
						>
							{ACTION_ICONS[a.key]} {a.label}
						</ActionBtn>
					))}
				</div>
			</div>

			<ConfirmDialog
				open={!!confirm}
				title={confirm?.title ?? ""}
				confirmLabel={confirm?.confirmLabel ?? ""}
				cancelLabel="Cancel"
				confirmVariant={confirm?.danger ? "danger" : "confirm"}
				onConfirm={handleConfirm}
				onCancel={() => setConfirm(null)}
			>
				<p style={{ fontSize: 12, color: "var(--v2-text-secondary)", lineHeight: 1.5, margin: 0 }}>
					{confirm?.desc}
				</p>
			</ConfirmDialog>
		</>
	);
};
