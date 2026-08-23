import { Infinity as InfinityIcon } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	formatExpiry,
	formatMissing,
	formatMonthDay,
	formatRelativeTimeUnix,
	formatResetStrategy,
	formatTraffic,
	getDaysLeft,
	getExpiryColor,
	getTrafficColor,
	getTrafficPercent,
	isUnlimitedExpiry,
	isUnlimitedTraffic,
} from "../../lib/format.ts";
import { hapticNotification } from "../../lib/haptics.ts";
import { openExternalDestination } from "../../lib/telegram-link.ts";
import type { SubscriptionData } from "../../types/subscription.ts";
import { ActionBtn } from "../ui/action-btn.tsx";
import { CheckIcon, CopyIcon, ExternalLinkIcon } from "../ui/icons.tsx";
import { InlineFeedback } from "../ui/inline-feedback.tsx";
import { StatusBadge } from "../ui/status-badge.tsx";
import styles from "./hero-card.module.css";

interface HeroCardProps {
	subscription: SubscriptionData | null;
}

export function HeroCard({ subscription }: HeroCardProps) {
	const { t } = useTranslation();

	if (!subscription) {
		return (
			<article
				className={`${styles.hero} ${styles.emptyHero}`}
				aria-label={t("home.noSubscription")}
			>
				<span className={styles.emptyTitle}>{t("home.noSubscription")}</span>
			</article>
		);
	}

	return <ActiveHeroCard subscription={subscription} />;
}

function ActiveHeroCard({ subscription }: { subscription: SubscriptionData }) {
	const { t } = useTranslation();
	const { usedBytes, totalBytes, deviceLimit, connectionLink } = subscription;
	const unlimitedTraffic = isUnlimitedTraffic(totalBytes);
	const unlimitedExpiry = isUnlimitedExpiry(subscription.expiresAt);
	const pct = unlimitedTraffic ? 0 : getTrafficPercent(usedBytes, totalBytes);
	const fillColor = getTrafficColor(pct);
	const daysLeft = getDaysLeft(subscription.expiresAt);
	const expiryColor = unlimitedExpiry ? "var(--v2-text-secondary)" : getExpiryColor(daysLeft);

	const [copied, setCopied] = useState(false);
	const [copyFailed, setCopyFailed] = useState(false);
	const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

	const handleOpen = useCallback(() => {
		try {
			const destination = new URL(connectionLink);
			if (destination.protocol !== "https:") return;
			if (!openExternalDestination(destination.href)) window.location.assign(destination.href);
		} catch {
			return;
		}
	}, [connectionLink]);

	const handleCopy = useCallback(async () => {
		setCopyFailed(false);
		try {
			await navigator.clipboard.writeText(connectionLink);
			if (timerRef.current) clearTimeout(timerRef.current);
			setCopied(true);
			hapticNotification("success");
			timerRef.current = setTimeout(() => setCopied(false), 2000);
		} catch {
			setCopied(false);
			setCopyFailed(true);
		}
	}, [connectionLink]);

	return (
		<div className={styles.hero}>
			{/* Row 1: name + badge | KPIs */}
			<div className={styles.topRow}>
				<div className={styles.topLeft}>
					<span className={styles.name}>{subscription.name}</span>
					<StatusBadge status={subscription.status} context="subscription" />
				</div>
				<div className={styles.topRight}>
					<div className={styles.kpi}>
						<div
							className={styles.kpiValue}
							data-ui={unlimitedExpiry ? "home-expiry-unlimited" : undefined}
							style={{ color: expiryColor }}
						>
							{unlimitedExpiry ? <InfinityIcon size={18} /> : formatExpiry(daysLeft)}
						</div>
						<div className={styles.kpiLabel}>{t("home.heroCard.expiresLabel")}</div>
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
						<div className={styles.kpiLabel}>{t("home.heroCard.devicesLabel")}</div>
					</div>
				</div>
			</div>

			{/* Row 2: traffic headline */}
			<div className={styles.trafficRow}>
				<span className={styles.trafficUsed}>{formatTraffic(usedBytes)}</span>
				<span className={styles.trafficTotal}>
					{t("format.ratioSuffix", {
						total: unlimitedTraffic
							? t("home.heroCard.trafficUnlimited")
							: formatTraffic(totalBytes),
					})}
				</span>
			</div>

			{/* Row 3: progress bar */}
			{!unlimitedTraffic && (
				<div>
					<div className={styles.barTrack}>
						<div
							className={styles.barFill}
							style={{
								width: `${pct}%`,
								background:
									"linear-gradient(90deg, var(--v2-bg-positive-primary), color-mix(in srgb, var(--v2-bg-positive-primary) 70%, transparent))",
							}}
						/>
					</div>
					<div className={styles.barLabels}>
						<span className={styles.barLabel}>
							<span className={styles.barDot} style={{ background: fillColor }} />
							{t("home.heroCard.usedPercent", { pct: Math.round(pct) })}
						</span>
						<span className={styles.barLabel}>
							<span className={styles.barDot} style={{ background: "var(--v2-bg-secondary)" }} />
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
							: formatMissing()}
					</span>
					<span className={styles.statLabel}>{t("home.heroCard.trafficResetLabel")}</span>
				</div>
				<div className={styles.stat}>
					<span className={styles.statValue}>
						{subscription.refillDate ? formatMonthDay(subscription.refillDate) : formatMissing()}
					</span>
					<span className={styles.statLabel}>{t("home.heroCard.nextResetLabel")}</span>
				</div>
				<div className={styles.stat}>
					<span className={styles.statValue}>
						{subscription.lifetimeUsedBytes != null
							? formatTraffic(subscription.lifetimeUsedBytes)
							: formatMissing()}
					</span>
					<span className={styles.statLabel}>{t("home.heroCard.allTimeLabel")}</span>
				</div>
				<div className={styles.stat}>
					<span className={styles.statValue}>{formatRelativeTimeUnix(subscription.updatedAt)}</span>
					<span className={styles.statLabel}>{t("home.heroCard.lastUpdatedLabel")}</span>
				</div>
			</div>

			{/* Row 5: actions */}
			<div className={styles.actions} data-ui="subscription-actions">
				<ActionBtn variant="confirm" size="md" className={styles.actionBtn} onClick={handleOpen}>
					<ExternalLinkIcon size={14} />
					{t("home.heroCard.openLink")}
				</ActionBtn>
				<ActionBtn
					variant="action"
					size="md"
					className={styles.actionBtn}
					onClick={() => void handleCopy()}
				>
					<span className={styles.actionIcon}>
						{copied ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
					</span>
					{copied ? t("home.heroCard.copied") : t("home.heroCard.copyLink")}
				</ActionBtn>
			</div>
			{copyFailed && (
				<InlineFeedback attention="action">{t("home.heroCard.copyFailed")}</InlineFeedback>
			)}
		</div>
	);
}
