import { Archive, FileText, Image, Paperclip, Video, X } from "lucide-react";
import { type ChangeEvent, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ActionBtn } from "../components/ui/action-btn.tsx";
import { InlineFeedback } from "../components/ui/inline-feedback.tsx";
import type {
	SupportAttachment,
	SupportCapabilities,
	SupportRequestStatus,
} from "../types/support.ts";
import styles from "./support.module.css";

const ATTACHMENT_ACCEPT =
	"image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/quicktime,video/webm,video/x-m4v,text/plain,application/zip,.jpg,.jpeg,.png,.webp,.heic,.heif,.mp4,.mov,.webm,.m4v,.txt,.zip";

function isAllowedFile(file: File): boolean {
	return /\.(jpe?g|png|webp|heic|heif|mp4|mov|webm|m4v|txt|zip)$/i.test(file.name);
}

export function formatBytes(bytes: number): string {
	if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
	return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function formatUpdatedAt(value: string, locale: string): string {
	const date = new Date(value);
	const today = new Date();
	if (date.toDateString() === today.toDateString()) {
		return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(date);
	}
	return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(date);
}

export function StatusPill({ status, admin }: { status: SupportRequestStatus; admin: boolean }) {
	const { t } = useTranslation();
	const labels = admin
		? {
				needs_reply: t("support.status.needsReply"),
				waiting_user: t("support.status.waitingUser"),
				resolved: t("support.status.resolved"),
			}
		: {
				needs_reply: t("support.status.withSupport"),
				waiting_user: t("support.status.replyReceived"),
				resolved: t("support.status.resolved"),
			};
	const tone =
		status === "resolved"
			? "resolved"
			: (admin && status === "needs_reply") || (!admin && status === "waiting_user")
				? "attention"
				: "neutral";
	return (
		<span className={styles.status} data-status={status} data-tone={tone}>
			<span aria-hidden="true" />
			{labels[status]}
		</span>
	);
}

export function topicLabel(t: ReturnType<typeof useTranslation>["t"], topic: string): string {
	const labels: Record<string, string> = {
		connection: t("support.topics.connection"),
		subscription: t("support.topics.subscription"),
		devices: t("support.topics.devices"),
		payment: t("support.topics.payment"),
		other: t("support.topics.other"),
	};
	return labels[topic] ?? labels.other;
}

export function FilePicker({
	files,
	onFilesChange,
	error,
	setError,
	capabilities,
	capabilitiesPending,
}: {
	files: File[];
	onFilesChange: (files: File[]) => void;
	error: string | null;
	setError: (error: string | null) => void;
	capabilities: SupportCapabilities | undefined;
	capabilitiesPending: boolean;
}) {
	const { t } = useTranslation();
	const inputRef = useRef<HTMLInputElement>(null);
	const attachmentsEnabled = capabilities?.attachmentsEnabled === true;
	const maxFiles = capabilities?.maxFiles ?? 5;
	const onChange = (event: ChangeEvent<HTMLInputElement>) => {
		const picked = Array.from(event.target.files ?? []);
		const allowed = picked.filter(
			(file) =>
				isAllowedFile(file) && file.size > 0 && file.size <= (capabilities?.maxFileBytes ?? 0),
		);
		const candidates = [...files, ...allowed].slice(0, maxFiles);
		const totalBytes = candidates.reduce((total, file) => total + file.size, 0);
		if (picked.some((file) => !isAllowedFile(file))) {
			setError(t("support.attachments.typeError"));
		} else if (
			picked.some((file) => file.size <= 0 || file.size > (capabilities?.maxFileBytes ?? 0))
		) {
			setError(t("support.attachments.sizeError"));
		} else if (files.length + allowed.length > maxFiles) {
			setError(t("support.attachments.countError", { count: maxFiles }));
		} else if (totalBytes > (capabilities?.maxTotalBytes ?? 0)) {
			setError(t("support.attachments.totalError"));
			event.target.value = "";
			return;
		} else {
			setError(null);
		}
		onFilesChange(candidates);
		event.target.value = "";
	};
	return (
		<div className={styles.filePicker}>
			<input
				ref={inputRef}
				className={styles.fileInput}
				type="file"
				multiple
				accept={ATTACHMENT_ACCEPT}
				aria-label={t("support.attachments.inputLabel")}
				onChange={onChange}
				disabled={!attachmentsEnabled}
			/>
			<ActionBtn
				variant="action"
				size="md"
				onClick={() => inputRef.current?.click()}
				disabled={!attachmentsEnabled || files.length >= maxFiles}
			>
				<Paperclip size={15} aria-hidden="true" />
				{t("support.attachments.add")}
			</ActionBtn>
			{files.length > 0 && (
				<div className={styles.selectedFiles} aria-live="polite">
					{files.map((file, index) => (
						<div key={`${file.name}-${file.lastModified}`} className={styles.selectedFile}>
							<FileText size={16} aria-hidden="true" />
							<span>
								<strong>{file.name}</strong>
								<small>{formatBytes(file.size)}</small>
							</span>
							<button
								type="button"
								onClick={() => onFilesChange(files.filter((_, current) => current !== index))}
								aria-label={t("support.attachments.remove", { name: file.name })}
							>
								<X size={15} />
							</button>
						</div>
					))}
				</div>
			)}
			<small className={styles.hint}>
				{capabilitiesPending
					? t("support.attachments.loading")
					: attachmentsEnabled && capabilities
						? t("support.attachments.hint", {
								count: capabilities.maxFiles,
								size: formatBytes(capabilities.maxFileBytes),
							})
						: t("support.attachments.unavailable")}
			</small>
			{error && <InlineFeedback attention="action">{error}</InlineFeedback>}
		</div>
	);
}

export function AttachmentIcon({ attachment }: { attachment: SupportAttachment }) {
	const Icon = { image: Image, video: Video, text: FileText, zip: Archive }[attachment.kind];
	return <Icon size={17} aria-hidden="true" />;
}
