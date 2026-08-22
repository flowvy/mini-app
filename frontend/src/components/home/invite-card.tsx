import { copyTextToClipboard, isShareMessageError, shareMessage } from "@telegram-apps/sdk-react";
import { Check, Copy, Send, Users } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useInvite } from "../../hooks/use-invite.ts";
import { apiPost } from "../../lib/api.ts";
import { hapticImpact, hapticNotification } from "../../lib/haptics.ts";
import { operatorFormattedText, operatorText } from "../../lib/operator-content.ts";
import { openTelegramDestination } from "../../lib/telegram-link.ts";
import type { PreparedInviteShare } from "../../types/registration.ts";
import { useCurrentUser } from "../auth-guard.tsx";
import { FormattedText } from "../content/formatted-text.tsx";
import { InlineFeedback } from "../ui/inline-feedback.tsx";
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
	const { branding } = useCurrentUser();
	const appName = branding.appName || t("common.appName");
	const content = branding.content;
	const context = { appName, app_name: appName, code: invite.data?.code ?? "" };
	const title = operatorText(content, "inviteTitle", t("home.invite.title"), context);
	const [copied, setCopied] = useState(false);
	const [copyFailed, setCopyFailed] = useState(false);
	const [sharing, setSharing] = useState(false);
	const [shareFailed, setShareFailed] = useState(false);

	if (invite.isPending) {
		return <InviteCardSkeleton />;
	}

	if (invite.isError || !invite.data) {
		return (
			<section className={styles.card} aria-label={title}>
				<strong className={styles.title}>{title}</strong>
				<p className={styles.description}>{t("home.invite.loadError")}</p>
				<button type="button" className={styles.retry} onClick={() => void invite.refetch()}>
					{t("common.retry")}
				</button>
			</section>
		);
	}

	const telegramHtmlToText = (value: string) => {
		const parsed = new DOMParser().parseFromString(value, "text/html");
		return parsed.body.textContent ?? "";
	};
	const shareText = operatorText(
		content,
		"inviteShareText",
		t("home.invite.shareText", { appName, code: invite.data.code }),
		{ ...context, code: invite.data.code },
	);
	const shareUrl = invite.data.referralUrl
		? `https://t.me/share/url?url=${encodeURIComponent(invite.data.referralUrl)}&text=${encodeURIComponent(
				telegramHtmlToText(shareText),
			)}`
		: "";
	const nativeShareAvailable = shareMessage.isAvailable();

	const sharePreparedInvite = async () => {
		setShareFailed(false);
		setSharing(true);
		hapticImpact("light");
		try {
			const prepared = await apiPost<PreparedInviteShare>("/me/invite/prepared-share");
			await shareMessage(prepared.id);
		} catch (error) {
			if (!(isShareMessageError(error) && String(error).includes("USER_DECLINED"))) {
				setShareFailed(true);
				hapticNotification("error");
			}
		} finally {
			setSharing(false);
		}
	};

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
						{title}
					</strong>
					<FormattedText className={styles.description}>
						{operatorFormattedText(
							content,
							"inviteDescription",
							t("home.invite.description"),
							context,
						)}
					</FormattedText>
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
			{shareFailed && (
				<InlineFeedback attention="action">{t("home.invite.shareFailed")}</InlineFeedback>
			)}

			{shareUrl &&
				(nativeShareAvailable ? (
					<button
						type="button"
						className={styles.share}
						disabled={sharing}
						onClick={() => void sharePreparedInvite()}
					>
						<Send size={15} />
						{t(sharing ? "home.invite.sharing" : "home.invite.share")}
					</button>
				) : (
					<a
						className={styles.share}
						href={shareUrl}
						target="_blank"
						rel="noreferrer"
						onClick={(event) => {
							hapticImpact("light");
							if (openTelegramDestination(shareUrl)) event.preventDefault();
						}}
					>
						<Send size={15} />
						{t("home.invite.share")}
					</a>
				))}
		</section>
	);
}
