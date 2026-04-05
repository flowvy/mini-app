import { formatShortDate, isUnlimitedExpiry } from "../../lib/format.ts";
import type { SubscriptionData } from "../../types/subscription.ts";
import { ExternalLinkIcon } from "../ui/icons.tsx";
import styles from "./detail-section.module.css";

interface DetailSectionProps {
	subscription: SubscriptionData;
}

export function DetailSection({ subscription }: DetailSectionProps) {
	const devicesValue =
		subscription.deviceLimit == null || subscription.deviceLimit === 0
			? "Unlimited"
			: `${subscription.deviceLimit} devices`;

	return (
		<div className={styles.body}>
			{/* Account Info */}
			<div className={styles.divider}>Account Info</div>
			<Row
				label="Created"
				hint="When your account was created"
				value={formatShortDate(subscription.createdAt)}
				mono
			/>
			<Row
				label="Expires"
				hint="When this subscription expires"
				value={
					isUnlimitedExpiry(subscription.expiresAt)
						? "Unlimited"
						: formatShortDate(subscription.expiresAt)
				}
				mono
			/>
			<Row
				label="Email"
				hint="Account email address"
				value={subscription.email}
				mono
				muted={!subscription.email}
			/>
			<Row
				label="Telegram ID"
				hint="Linked Telegram account"
				value={subscription.telegramId}
				mono
				muted={!subscription.telegramId}
			/>
			<Row
				label="Devices"
				hint="Max devices connected at the same time"
				value={devicesValue}
				mono
			/>

			{/* Profile Settings */}
			<div className={styles.divider}>Profile Settings</div>
			<Row
				label="Auto-update"
				hint="Fetch profile updates automatically"
				value={subscription.autoUpdate ? "On" : "Off"}
				accent={subscription.autoUpdate}
			/>
			<Row
				label="Update interval"
				hint="How often to check for updates"
				value={`Every ${subscription.updateInterval}h`}
				mono
			/>

			{/* Quick Links */}
			<div className={styles.divider}>Quick Links</div>
			<LinkRow label="Support" url={subscription.supportUrl} />
			<LinkRow label="Renew" url={subscription.renewUrl} />
		</div>
	);
}

function Row({
	label,
	hint,
	value,
	mono,
	muted,
	accent,
}: {
	label: string;
	hint?: string;
	value: string | null | undefined;
	mono?: boolean;
	muted?: boolean;
	accent?: boolean;
}) {
	const display = value ?? "Not specified";
	const isMuted = muted ?? !value;
	const cls = [
		styles.rowValue,
		isMuted && styles.rowMuted,
		mono && styles.rowMono,
		accent && styles.rowAccent,
	]
		.filter(Boolean)
		.join(" ");

	return (
		<div className={styles.row}>
			{hint ? (
				<div className={styles.rowLabelWrap}>
					<span className={styles.rowLabel}>{label}</span>
					<span className={styles.rowHint}>{hint}</span>
				</div>
			) : (
				<span className={styles.rowLabel}>{label}</span>
			)}
			<span className={cls}>{display}</span>
		</div>
	);
}

function LinkRow({ label, url }: { label: string; url: string | null }) {
	if (!url) return null;
	return (
		<div className={styles.row}>
			<span className={styles.rowLabel}>{label}</span>
			<a href={url} target="_blank" rel="noopener noreferrer" className={styles.linkBtn}>
				<ExternalLinkIcon size={13} />
			</a>
		</div>
	);
}
