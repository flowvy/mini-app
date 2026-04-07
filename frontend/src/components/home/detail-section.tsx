import { useTranslation } from "react-i18next";
import { formatShortDate, isUnlimitedExpiry } from "../../lib/format.ts";
import type { SubscriptionData } from "../../types/subscription.ts";
import { ExternalLinkIcon } from "../ui/icons.tsx";
import styles from "./detail-section.module.css";

interface DetailSectionProps {
	subscription: SubscriptionData;
}

export function DetailSection({ subscription }: DetailSectionProps) {
	const { t } = useTranslation();
	const devicesValue =
		subscription.deviceLimit == null || subscription.deviceLimit === 0
			? t("home.detail.devicesUnlimited")
			: t("home.detail.devicesCount", { n: subscription.deviceLimit });

	return (
		<div className={styles.body}>
			{/* Account Info */}
			<div className={styles.divider}>{t("home.detail.accountInfo")}</div>
			<Row
				label={t("home.detail.created")}
				hint={t("home.detail.createdHint")}
				value={formatShortDate(subscription.createdAt)}
				mono
			/>
			<Row
				label={t("home.detail.expires")}
				hint={t("home.detail.expiresHint")}
				value={
					isUnlimitedExpiry(subscription.expiresAt)
						? t("home.detail.expiresUnlimited")
						: formatShortDate(subscription.expiresAt)
				}
				mono
			/>
			<Row
				label={t("home.detail.email")}
				hint={t("home.detail.emailHint")}
				value={subscription.email}
				mono
				muted={!subscription.email}
			/>
			<Row
				label={t("home.detail.telegramId")}
				hint={t("home.detail.telegramIdHint")}
				value={subscription.telegramId}
				mono
				muted={!subscription.telegramId}
			/>
			<Row
				label={t("home.detail.devices")}
				hint={t("home.detail.devicesHint")}
				value={devicesValue}
				mono
			/>

			{/* Profile Settings */}
			<div className={styles.divider}>{t("home.detail.profileSettings")}</div>
			<Row
				label={t("home.detail.autoUpdate")}
				hint={t("home.detail.autoUpdateHint")}
				value={
					subscription.autoUpdate ? t("home.detail.autoUpdateOn") : t("home.detail.autoUpdateOff")
				}
				accent={subscription.autoUpdate}
			/>
			<Row
				label={t("home.detail.updateInterval")}
				hint={t("home.detail.updateIntervalHint")}
				value={t("home.detail.updateIntervalValue", { n: subscription.updateInterval })}
				mono
			/>

			{/* Quick Links */}
			<div className={styles.divider}>{t("home.detail.quickLinks")}</div>
			<LinkRow label={t("home.detail.support")} url={subscription.supportUrl} />
			<LinkRow label={t("home.detail.renew")} url={subscription.renewUrl} />
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
	const { t } = useTranslation();
	const display = value ?? t("home.detail.notSpecified");
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
