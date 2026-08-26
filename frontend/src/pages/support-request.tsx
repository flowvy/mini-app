import { useParams } from "@tanstack/react-router";
import { Download, LifeBuoy, Send, User } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCurrentUser } from "../components/auth-guard.tsx";
import { FormattedText } from "../components/content/formatted-text.tsx";
import { FormattedTextEditor } from "../components/content/formatted-text-editor.tsx";
import { ActionBtn } from "../components/ui/action-btn.tsx";
import { ErrorState } from "../components/ui/error-state.tsx";
import {
	FormField,
	FormSection,
	FormSectionCard,
	FormSurfaceBody,
} from "../components/ui/form-section.tsx";
import { InlineFeedback } from "../components/ui/inline-feedback.tsx";
import { PageLoading } from "../components/ui/page-loading.tsx";
import {
	downloadSupportAttachment,
	useReplyToSupportRequest,
	useSetSupportRequestResolved,
	useSupportCapabilities,
	useSupportRequest,
} from "../hooks/use-support.ts";
import type { SupportAttachment } from "../types/support.ts";
import styles from "./support.module.css";
import {
	AttachmentIcon,
	FilePicker,
	formatBytes,
	formatUpdatedAt,
	StatusPill,
	topicLabel,
} from "./support-shared.tsx";

export function SupportRequestPage() {
	const { t, i18n } = useTranslation();
	const user = useCurrentUser();
	const isAdmin = user.role === "admin";
	const { requestId } = useParams({ from: "/support/requests/$requestId" });
	const requestQuery = useSupportRequest(requestId);
	const capabilities = useSupportCapabilities();
	const reply = useReplyToSupportRequest();
	const setResolved = useSetSupportRequestResolved();
	const [message, setMessage] = useState("");
	const [files, setFiles] = useState<File[]>([]);
	const [fileError, setFileError] = useState<string | null>(null);
	const [downloadError, setDownloadError] = useState(false);
	if (requestQuery.isPending) return <PageLoading />;
	if (requestQuery.error || !requestQuery.data)
		return <ErrorState onAction={() => void requestQuery.refetch()} />;
	const request = requestQuery.data;
	const resolved = request.status === "resolved";
	const messageTooLong = message.length > 4000;
	const sendReply = (event: FormEvent) => {
		event.preventDefault();
		if (messageTooLong) return;
		reply.mutate(
			{ requestId, message: message.trim(), files },
			{
				onSuccess: () => {
					setMessage("");
					setFiles([]);
					setFileError(null);
				},
			},
		);
	};
	const download = async (attachment: SupportAttachment) => {
		setDownloadError(false);
		try {
			const target = await downloadSupportAttachment(attachment.id);
			const anchor = document.createElement("a");
			anchor.href = target.url;
			anchor.download = attachment.name;
			anchor.target = "_blank";
			anchor.rel = "noopener noreferrer";
			anchor.click();
		} catch {
			setDownloadError(true);
		}
	};
	return (
		<div
			className={`${styles.page} ${styles.detailPage}`}
			data-support-detail={isAdmin ? "admin" : "user"}
		>
			<FormSection
				title={t("support.request.details")}
				action={<StatusPill status={request.status} admin={isAdmin} />}
			>
				<FormSectionCard>
					<div className={styles.ticketSummary}>
						<span className={styles.eyebrow}>
							{t("support.request.number", { number: request.number })}
						</span>
						<h1 id="support-request-title">{request.subject}</h1>
						<div className={styles.ticketMeta}>
							<span>{topicLabel(t, request.topic)}</span>
							<span className={styles.metaSeparator} aria-hidden="true" />
							<span>
								{t("support.request.updated", {
									value: formatUpdatedAt(request.updatedAt, i18n.language),
								})}
							</span>
						</div>
					</div>
					<div className={styles.requestActionRow}>
						<span>
							<strong>{t("support.request.statusAction")}</strong>
							<small>
								{resolved
									? t("support.request.reopenDescription")
									: t("support.request.resolveDescription")}
							</small>
						</span>
						<ActionBtn
							variant="action"
							size="sm"
							loading={setResolved.isPending}
							onClick={() => setResolved.mutate({ requestId, resolved: !resolved })}
						>
							{resolved ? t("support.actions.reopen") : t("support.actions.resolve")}
						</ActionBtn>
					</div>
				</FormSectionCard>
			</FormSection>
			{isAdmin && (
				<FormSection title={t("support.request.userContext")}>
					<FormSectionCard>
						<dl className={styles.userContext}>
							<div>
								<dt>{t("support.request.user")}</dt>
								<dd>{request.requester.fullName}</dd>
							</div>
							<div>
								<dt>{t("support.request.subscription")}</dt>
								<dd>{request.context.subscriptionStatus ?? "—"}</dd>
							</div>
							<div>
								<dt>{t("support.request.device")}</dt>
								<dd>{request.context.device ?? "—"}</dd>
							</div>
							<div>
								<dt>{t("support.request.appVersion")}</dt>
								<dd>{request.context.appVersion ?? "—"}</dd>
							</div>
						</dl>
					</FormSectionCard>
				</FormSection>
			)}
			<FormSection title={t("support.request.conversation")}>
				<FormSectionCard>
					<div className={styles.thread} data-ui="support-conversation">
						{request.messages.map((item) => (
							<article
								key={item.id}
								className={styles.message}
								data-author={item.author}
								data-owned={
									(isAdmin && item.author === "support") || (!isAdmin && item.author === "user")
								}
							>
								<header>
									<span className={styles.messageAuthor}>
										<span
											className={styles.messageAvatar}
											aria-hidden="true"
											data-ui="support-message-avatar"
										>
											{item.author === "support" ? <LifeBuoy size={15} /> : <User size={15} />}
										</span>
										<strong>{item.authorName}</strong>
									</span>
									<time dateTime={item.createdAt}>
										{formatUpdatedAt(item.createdAt, i18n.language)}
									</time>
								</header>
								<FormattedText className={styles.messageBody}>{item.body}</FormattedText>
								{item.attachments.length > 0 && (
									<div className={styles.messageFiles}>
										{item.attachments.map((attachment) => (
											<div
												key={attachment.id}
												className={styles.messageFile}
												data-ui="support-message-file"
											>
												<span className={styles.fileKind} data-ui="support-file-kind">
													<AttachmentIcon attachment={attachment} />
												</span>
												<span>
													<strong>{attachment.name}</strong>
													<small>
														{attachment.kind === "zip" ? `${t("support.attachments.zip")} · ` : ""}
														{formatBytes(attachment.sizeBytes)}
														{attachment.passwordProtected
															? ` · ${t("support.attachments.passwordProtected")}`
															: ""}
													</small>
												</span>
												<button
													type="button"
													onClick={() => void download(attachment)}
													aria-label={t("support.attachments.download", {
														name: attachment.name,
													})}
												>
													<Download size={16} />
												</button>
											</div>
										))}
									</div>
								)}
							</article>
						))}
					</div>
				</FormSectionCard>
			</FormSection>
			<FormSection title={t("support.reply.label")}>
				<FormSectionCard>
					<form onSubmit={sendReply}>
						<FormSurfaceBody className={styles.composer} dataUi="support-reply-composer">
							<FormField label={isAdmin ? t("support.reply.adminLabel") : t("support.reply.label")}>
								<FormattedTextEditor
									id="support-reply"
									ariaLabel={isAdmin ? t("support.reply.adminLabel") : t("support.reply.label")}
									value={message}
									onChange={setMessage}
									placeholder={
										isAdmin ? t("support.reply.adminPlaceholder") : t("support.reply.placeholder")
									}
									maxLength={4000}
								/>
							</FormField>
							{messageTooLong && (
								<InlineFeedback attention="action">{t("support.formatLimitError")}</InlineFeedback>
							)}
							<FilePicker
								files={files}
								onFilesChange={setFiles}
								error={fileError}
								setError={setFileError}
								capabilities={capabilities.data}
								capabilitiesPending={capabilities.isPending}
							/>
							{resolved && <p className={styles.reopenHint}>{t("support.reply.reopenHint")}</p>}
							{(reply.error || setResolved.error || downloadError) && (
								<InlineFeedback attention="action">
									{downloadError
										? t("support.actions.downloadError")
										: t("support.actions.updateError")}
								</InlineFeedback>
							)}
							<div className={styles.composerFooter}>
								<ActionBtn
									type="submit"
									size="md"
									loading={reply.isPending}
									disabled={!message.trim() || messageTooLong}
								>
									<Send size={16} />
									{t("support.reply.send")}
								</ActionBtn>
							</div>
						</FormSurfaceBody>
					</form>
				</FormSectionCard>
			</FormSection>
		</div>
	);
}
