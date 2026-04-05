import { Infinity as InfinityIcon } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import {
	formatExpiry,
	formatMonthDay,
	formatRelativeTime,
	formatResetStrategy,
	formatTraffic,
	getDaysLeft,
	getExpiryColor,
	getTrafficColor,
	getTrafficPercent,
	isUnlimitedExpiry,
	isUnlimitedTraffic,
} from "../../lib/format.ts";
import type { SubscriptionData } from "../../types/subscription.ts";
import { CheckIcon, CopyIcon } from "../ui/icons.tsx";
import { StatusBadge } from "../ui/status-badge.tsx";
import styles from "./hero-card.module.css";

interface HeroCardProps {
	subscription: SubscriptionData;
}

export function HeroCard({ subscription }: HeroCardProps) {
	const { usedBytes, totalBytes, deviceLimit, connectionLink } = subscription;
	const unlimitedTraffic = isUnlimitedTraffic(totalBytes);
	const unlimitedExpiry = isUnlimitedExpiry(subscription.expiresAt);
	const pct = unlimitedTraffic ? 0 : getTrafficPercent(usedBytes, totalBytes);
	const fillColor = getTrafficColor(pct);
	const daysLeft = getDaysLeft(subscription.expiresAt);
	const expiryColor = unlimitedExpiry ? "var(--v2-text-primary)" : getExpiryColor(daysLeft);

	const [copied, setCopied] = useState(false);
	const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

	const handleCopy = useCallback(() => {
		navigator.clipboard.writeText(connectionLink).then(() => {
			if (timerRef.current) clearTimeout(timerRef.current);
			setCopied(true);
			timerRef.current = setTimeout(() => setCopied(false), 2000);
		});
	}, [connectionLink]);

	return (
		<div className={styles.hero}>
			{/* Row 1: name + badge | KPIs */}
			<div className={styles.topRow}>
				<div className={styles.topLeft}>
					<span className={styles.name}>{subscription.name}</span>
					<StatusBadge status={subscription.status} />
				</div>
				<div className={styles.topRight}>
					<div className={styles.kpi}>
						<div className={styles.kpiValue} style={{ color: expiryColor }}>
							{unlimitedExpiry ? <InfinityIcon size={18} /> : formatExpiry(daysLeft)}
						</div>
						<div className={styles.kpiLabel}>Expires</div>
					</div>
					<div className={styles.kpiDivider} />
					<div className={styles.kpi}>
						<div className={styles.kpiValue}>
							{deviceLimit == null || deviceLimit === 0 ? (
								<InfinityIcon size={18} />
							) : (
								String(deviceLimit)
							)}
						</div>
						<div className={styles.kpiLabel}>Devices</div>
					</div>
				</div>
			</div>

			{/* Row 2: traffic headline */}
			<div className={styles.trafficRow}>
				<span className={styles.trafficUsed}>{formatTraffic(usedBytes)}</span>
				<span className={styles.trafficTotal}>
					/ {unlimitedTraffic ? "Unlimited" : formatTraffic(totalBytes)}
				</span>
			</div>

			{/* Row 3: progress bar */}
			{!unlimitedTraffic && (
				<div>
					<div className={styles.barTrack}>
						<div
							className={styles.barFill}
							style={{ width: `${pct}%`, background: fillColor, opacity: 0.7 }}
						/>
					</div>
					<div className={styles.barLabels}>
						<span className={styles.barLabel}>
							<span className={styles.barDot} style={{ background: fillColor }} />
							Used {Math.round(pct)}%
						</span>
						<span className={styles.barLabel}>
							<span className={styles.barDot} style={{ background: "var(--v2-bg-tertiary)" }} />
							{formatTraffic(totalBytes - usedBytes)}
						</span>
					</div>
				</div>
			)}

			{/* Row 4: stats strip */}
			<div className={styles.stats}>
				<div className={styles.stat}>
					<span className={styles.statValue}>
						{subscription.resetStrategy
							? formatResetStrategy(subscription.resetStrategy)
							: "\u2014"}
					</span>
					<span className={styles.statLabel}>Traffic Reset</span>
				</div>
				<div className={styles.stat}>
					<span className={styles.statValue}>
						{subscription.refillDate ? formatMonthDay(subscription.refillDate) : "\u2014"}
					</span>
					<span className={styles.statLabel}>Next Reset</span>
				</div>
				<div className={styles.stat}>
					<span className={styles.statValue}>
						{subscription.lifetimeUsedBytes != null
							? formatTraffic(subscription.lifetimeUsedBytes)
							: "\u2014"}
					</span>
					<span className={styles.statLabel}>All Time</span>
				</div>
				<div className={styles.stat}>
					<span className={styles.statValue}>{formatRelativeTime(subscription.updatedAt)}</span>
					<span className={styles.statLabel}>Last Updated</span>
				</div>
			</div>

			{/* Row 5: action */}
			<div className={styles.actions}>
				<button type="button" className={styles.actionBtn} onClick={handleCopy}>
					<span className={styles.actionIcon}>
						{copied ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
					</span>
					{copied ? "Copied" : "Copy subscription link"}
				</button>
			</div>
		</div>
	);
}
