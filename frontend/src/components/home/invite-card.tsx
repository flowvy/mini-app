import { copyTextToClipboard, openTelegramLink } from "@telegram-apps/sdk-react";
import { Check, Copy, Send, Users } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useInvite } from "../../hooks/use-invite.ts";
import { hapticImpact, hapticNotification } from "../../lib/haptics.ts";
import { Skeleton } from "../ui/skeleton.tsx";
import styles from "./invite-card.module.css";

export function InviteCardSkeleton() {
	const { t } = useTranslation();
	return (
		<section className={styles.card} aria-label={t("home.invite.loadingLabel")} aria-busy="true">
			<Skeleton width="42%" height={14} radius={4} />
			<Skeleton width="78%" height={11} radius={4} />
			<Skeleton width="100%" height={44} radius={8} />
		</section>
	);
}

export function InviteCard() {
	const { t } = useTranslation();
	const invite = useInvite();
	const [copied, setCopied] = useState(false);
	const [copyFailed, setCopyFailed] = useState(false);

	if (invite.isPending) {
		return <InviteCardSkeleton />;
	}

	if (invite.isError || !invite.data) {
		return (
			<section className={styles.card} aria-label={t("home.invite.title")}>
				<strong className={styles.title}>{t("home.invite.title")}</strong>
				<p className={styles.description}>{t("home.invite.loadError")}</p>
				<button type="button" className={styles.retry} onClick={() => void invite.refetch()}>
					{t("common.retry")}
				</button>
			</section>
		);
	}

	const shareUrl = invite.data.referralUrl
		? `https://t.me/share/url?url=${encodeURIComponent(invite.data.referralUrl)}&text=${encodeURIComponent(
				t("home.invite.shareText", { code: invite.data.code }),
			)}`
		: "";

	const copyCode = async () => {
		try {
			setCopyFailed(false);
			await copyTextToClipboard(invite.data.code);
			setCopied(true);
			hapticNotification("success");
			window.setTimeout(() => setCopied(false), 1800);
		} catch {
			setCopied(false);
			setCopyFailed(true);
			hapticNotification("error");
		}
	};

	return (
		<section className={styles.card} aria-labelledby="invite-card-title">
			<div className={styles.heading}>
				<div>
					<strong id="invite-card-title" className={styles.title}>
						{t("home.invite.title")}
					</strong>
					<p className={styles.description}>{t("home.invite.description")}</p>
				</div>
				<div className={styles.count} aria-label={t("home.invite.invitedLabel")}>
					<Users size={14} />
					<strong>{invite.data.invitedCount}</strong>
					<span>{t("home.invite.invitedShort")}</span>
				</div>
			</div>

			<button type="button" className={styles.code} onClick={() => void copyCode()}>
				<span>{invite.data.code}</span>
				<span className={styles.copyState} aria-live="polite">
					{copied ? <Check size={15} /> : <Copy size={15} />}
					{copied
						? t("home.invite.copied")
						: copyFailed
							? t("home.invite.copyFailed")
							: t("home.invite.copy")}
				</span>
			</button>

			{invite.data.referralStatus !== "ready" && (
				<p className={styles.notice}>{t("home.invite.shareUnavailable")}</p>
			)}

			{shareUrl && (
				<a
					className={styles.share}
					href={shareUrl}
					target="_blank"
					rel="noreferrer"
					onClick={(event) => {
						hapticImpact("light");
						if (openTelegramLink.isAvailable()) {
							event.preventDefault();
							openTelegramLink(shareUrl);
						}
					}}
				>
					<Send size={15} />
					{t("home.invite.share")}
				</a>
			)}
		</section>
	);
}
