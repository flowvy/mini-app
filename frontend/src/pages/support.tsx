import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import {
	Archive,
	BookOpenText,
	ChevronRight,
	CircleAlert,
	CircleCheck,
	CircleHelp,
	Clock3,
	CreditCard,
	Download,
	FileText,
	Image,
	LifeBuoy,
	MessageSquarePlus,
	Paperclip,
	RefreshCw,
	Search,
	Send,
	ShieldCheck,
	Smartphone,
	User,
	Video,
	WifiOff,
	X,
} from "lucide-react";
import { type ChangeEvent, type FormEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCurrentUser } from "../components/auth-guard.tsx";
import { FormattedTextEditor } from "../components/content/formatted-text-editor.tsx";
import { FormattedText } from "../components/content/formatted-text.tsx";
import { ActionBtn } from "../components/ui/action-btn.tsx";
import { ErrorState } from "../components/ui/error-state.tsx";
import {
	FormField,
	FormFieldInput,
	FormFieldSelect,
	FormSection,
	FormSectionCard,
	FormSurfaceBody,
} from "../components/ui/form-section.tsx";
import { InlineFeedback } from "../components/ui/inline-feedback.tsx";
import { PageLoading } from "../components/ui/page-loading.tsx";
import { SegmentedControl } from "../components/ui/segmented-control.tsx";
import {
	downloadSupportAttachment,
	useCreateSupportRequest,
	useReplyToSupportRequest,
	useSetSupportRequestResolved,
	useSupportArticle,
	useSupportArticles,
	useSupportCapabilities,
	useSupportRequest,
	useSupportRequests,
} from "../hooks/use-support.ts";
import { handleImeKeyDown } from "../lib/ime.ts";
import type {
	SupportArticle,
	SupportArticleTopic,
	SupportAttachment,
	SupportCapabilities,
	SupportRequestStatus,
	SupportRequestSummary,
} from "../types/support.ts";
import styles from "./support.module.css";

const ATTACHMENT_ACCEPT =
	"image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/quicktime,video/webm,video/x-m4v,text/plain,application/zip,.jpg,.jpeg,.png,.webp,.heic,.heif,.mp4,.mov,.webm,.m4v,.txt,.zip";

function isAllowedFile(file: File): boolean {
	return /\.(jpe?g|png|webp|heic|heif|mp4|mov|webm|m4v|txt|zip)$/i.test(file.name);
}

function formatBytes(bytes: number): string {
	if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
	return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatUpdatedAt(value: string, locale: string): string {
	const date = new Date(value);
	const today = new Date();
	if (date.toDateString() === today.toDateString()) {
		return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(date);
	}
	return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).format(date);
}

function StatusPill({ status, admin }: { status: SupportRequestStatus; admin: boolean }) {
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

function RequestStatusIcon({
	status,
	admin,
}: {
	status: SupportRequestStatus;
	admin: boolean;
}) {
	const Icon = {
		needs_reply: CircleAlert,
		waiting_user: Clock3,
		resolved: CircleCheck,
	}[status];
	const tone =
		status === "resolved"
			? "resolved"
			: (admin && status === "needs_reply") || (!admin && status === "waiting_user")
				? "attention"
				: "neutral";
	return (
		<span
			className={styles.requestStatusIcon}
			data-request-status-icon={status}
			data-tone={tone}
			aria-hidden="true"
		>
			<Icon size={18} />
		</span>
	);
}

function topicLabel(t: ReturnType<typeof useTranslation>["t"], topic: string): string {
	const labels: Record<string, string> = {
		connection: t("support.topics.connection"),
		subscription: t("support.topics.subscription"),
		devices: t("support.topics.devices"),
		payment: t("support.topics.payment"),
		other: t("support.topics.other"),
	};
	return labels[topic] ?? labels.other;
}

function TopicIcon({ topic }: { topic: SupportArticleTopic }) {
	const Icon = {
		connection: WifiOff,
		subscription: RefreshCw,
		devices: Smartphone,
		payment: CreditCard,
		other: CircleHelp,
	}[topic];
	return <Icon size={18} aria-hidden="true" />;
}

function EmptySection({ children }: { children: string }) {
	return <p className={styles.emptySection}>{children}</p>;
}

function SupportSearch({
	value,
	onChange,
	label,
}: {
	value: string;
	onChange: (value: string) => void;
	label: string;
}) {
	return (
		<label className={styles.search}>
			<Search size={16} aria-hidden="true" />
			<span className={styles.srOnly}>{label}</span>
			<input
				type="search"
				value={value}
				onChange={(event) => onChange(event.target.value)}
				placeholder={label}
				inputMode="search"
				enterKeyHint="search"
				autoCapitalize="none"
				autoCorrect="off"
				autoComplete="off"
				spellCheck={false}
				onKeyDown={(event) => handleImeKeyDown(event, "search", () => undefined)}
			/>
		</label>
	);
}

function RequestRow({
	request,
	admin = false,
}: { request: SupportRequestSummary; admin?: boolean }) {
	const { t, i18n } = useTranslation();
	const navigate = useNavigate();
	return (
		<button
			type="button"
			className={styles.requestRow}
			onClick={() =>
				void navigate({
					to: "/support/requests/$requestId",
					params: { requestId: request.id },
				})
			}
		>
			<RequestStatusIcon status={request.status} admin={admin} />
			<span className={styles.requestCopy}>
				{admin && <small>{request.requester.fullName}</small>}
				<strong>{request.subject}</strong>
				<span>{request.lastMessagePreview}</span>
			</span>
			<span className={styles.requestSide}>
				<span className={styles.requestTime}>
					{request.unreadCount > 0 && (
						<b aria-label={t("support.requests.unread", { count: request.unreadCount })}>
							{request.unreadCount}
						</b>
					)}
					{formatUpdatedAt(request.updatedAt, i18n.language)}
				</span>
				<StatusPill status={request.status} admin={admin} />
			</span>
		</button>
	);
}

function UserOverview({
	articles,
	articlesPending,
	articlesError,
	onRetryArticles,
	requests,
	isPending,
	hasError,
	onRetry,
}: {
	articles: SupportArticle[];
	articlesPending: boolean;
	articlesError: boolean;
	onRetryArticles: () => void;
	requests: SupportRequestSummary[];
	isPending: boolean;
	hasError: boolean;
	onRetry: () => void;
}) {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const [search, setSearch] = useState("");
	const normalizedSearch = search.trim().toLocaleLowerCase();
	const answers = articles.filter((article) =>
		`${article.title} ${article.summary} ${article.body}`
			.toLocaleLowerCase()
			.includes(normalizedSearch),
	);
	const active = requests.filter((request) => request.status !== "resolved");
	const resolved = requests.filter((request) => request.status === "resolved");
	const requestState = (emptyCopy: string) => {
		if (isPending) return <EmptySection>{t("support.requests.loading")}</EmptySection>;
		if (hasError) {
			return (
				<div className={styles.requestLoadState}>
					<InlineFeedback>{t("support.requests.loadError")}</InlineFeedback>
					<ActionBtn variant="action" size="sm" onClick={onRetry}>
						{t("common.retry")}
					</ActionBtn>
				</div>
			);
		}
		return <EmptySection>{emptyCopy}</EmptySection>;
	};

	return (
		<div className={styles.page} data-support-view="user">
			<FormSection title={t("support.quickAnswers.title")}>
				<FormSectionCard>
					<SupportSearch
						value={search}
						onChange={setSearch}
						label={t("support.quickAnswers.search")}
					/>
					<div className={styles.answerList}>
						{answers.map((answer) => {
							return (
								<button
									key={answer.id}
									type="button"
									className={styles.answerRow}
									onClick={() =>
										void navigate({
											to: "/support/answers/$articleId",
											params: { articleId: answer.id },
										})
									}
								>
									<span className={styles.answerIcon}>
										<TopicIcon topic={answer.topic} />
									</span>
									<span>
										<strong>{answer.title}</strong>
										<small>{answer.summary}</small>
									</span>
									<ChevronRight size={17} aria-hidden="true" />
								</button>
							);
						})}
						{articlesPending && <EmptySection>{t("support.quickAnswers.loading")}</EmptySection>}
						{articlesError && (
							<div className={styles.requestLoadState}>
								<InlineFeedback>{t("support.quickAnswers.loadError")}</InlineFeedback>
								<ActionBtn variant="action" size="sm" onClick={onRetryArticles}>
									{t("common.retry")}
								</ActionBtn>
							</div>
						)}
						{!articlesPending && !articlesError && answers.length === 0 && (
							<EmptySection>{t("support.quickAnswers.empty")}</EmptySection>
						)}
					</div>
				</FormSectionCard>
			</FormSection>
			<FormSection
				title={t("support.active.title")}
				action={<span className={styles.count}>{active.length}</span>}
			>
				<FormSectionCard>
					{!isPending && !hasError && active.length
						? active.map((request) => <RequestRow key={request.id} request={request} />)
						: requestState(t("support.active.empty"))}
				</FormSectionCard>
			</FormSection>
			<FormSection
				title={t("support.resolved.title")}
				action={<span className={styles.count}>{resolved.length}</span>}
			>
				<FormSectionCard>
					{!isPending && !hasError && resolved.length
						? resolved.map((request) => <RequestRow key={request.id} request={request} />)
						: requestState(t("support.resolved.empty"))}
				</FormSectionCard>
			</FormSection>
			<section className={styles.needHelp} aria-labelledby="support-need-help">
				<div>
					<h1 id="support-need-help">{t("support.needHelp.title")}</h1>
					<p>{t("support.needHelp.description")}</p>
				</div>
				<ActionBtn
					size="md"
					onClick={() => void navigate({ to: "/support/new", search: { topic: undefined } })}
					aria-label={t("support.needHelp.action")}
				>
					<MessageSquarePlus size={17} aria-hidden="true" />
					{t("support.needHelp.action")}
				</ActionBtn>
			</section>
		</div>
	);
}

function AdminOverview({ requests }: { requests: SupportRequestSummary[] }) {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const [segment, setSegment] = useState<"active" | "resolved">("active");
	const [search, setSearch] = useState("");
	const query = search.trim().toLocaleLowerCase();
	const visible = requests.filter((request) => {
		const inSegment =
			segment === "resolved" ? request.status === "resolved" : request.status !== "resolved";
		const matches =
			`${request.subject} ${request.requester.fullName} ${request.requester.username ?? ""}`
				.toLocaleLowerCase()
				.includes(query);
		return inSegment && matches;
	});
	const needsReply = visible.filter((request) => request.status === "needs_reply");
	const waitingUser = visible.filter((request) => request.status === "waiting_user");
	const resolved = visible.filter((request) => request.status === "resolved");
	const activeCount = requests.filter((request) => request.status !== "resolved").length;
	const resolvedCount = requests.length - activeCount;
	return (
		<div className={styles.page} data-support-view="admin">
			<SegmentedControl
				options={[
					{ key: "active", label: t("support.admin.active", { count: activeCount }) },
					{ key: "resolved", label: t("support.admin.resolved", { count: resolvedCount }) },
				]}
				value={segment}
				onChange={(value) => setSegment(value as "active" | "resolved")}
				ariaLabel={t("support.admin.filterLabel")}
			/>
			<SupportSearch value={search} onChange={setSearch} label={t("support.admin.search")} />
			{segment === "active" ? (
				<>
					<AdminGroup title={t("support.admin.needsReply")} requests={needsReply} />
					<AdminGroup title={t("support.admin.waitingUser")} requests={waitingUser} />
				</>
			) : (
				<AdminGroup title={t("support.admin.recentlyResolved")} requests={resolved} />
			)}
			{visible.length === 0 && (
				<div className={styles.standaloneEmpty}>{t("support.admin.empty")}</div>
			)}
			<FormSection title={t("support.quickAnswers.title")}>
				<FormSectionCard>
					<button
						type="button"
						className={styles.managementEntry}
						onClick={() => void navigate({ to: "/support/manage/answers" })}
					>
						<span className={styles.answerIcon} aria-hidden="true">
							<BookOpenText size={18} />
						</span>
						<span className={styles.managementEntryCopy}>
							<strong>{t("support.manage.open")}</strong>
							<small>{t("support.manage.description")}</small>
						</span>
						<ChevronRight size={17} aria-hidden="true" />
					</button>
				</FormSectionCard>
			</FormSection>
		</div>
	);
}

function AdminGroup({ title, requests }: { title: string; requests: SupportRequestSummary[] }) {
	if (!requests.length) return null;
	return (
		<FormSection title={title} action={<span className={styles.count}>{requests.length}</span>}>
			<FormSectionCard>
				{requests.map((request) => (
					<RequestRow key={request.id} request={request} admin />
				))}
			</FormSectionCard>
		</FormSection>
	);
}

export function Support() {
	const user = useCurrentUser();
	return user.role === "admin" ? <AdminSupport /> : <UserSupport />;
}

function UserSupport() {
	const requests = useSupportRequests();
	const articles = useSupportArticles();
	return (
		<UserOverview
			articles={articles.data?.articles ?? []}
			articlesPending={articles.isPending}
			articlesError={Boolean(articles.error)}
			onRetryArticles={() => void articles.refetch()}
			requests={requests.data?.requests ?? []}
			isPending={requests.isPending}
			hasError={Boolean(requests.error)}
			onRetry={() => void requests.refetch()}
		/>
	);
}

function AdminSupport() {
	const requests = useSupportRequests();
	if (requests.isPending) return <PageLoading />;
	if (requests.error) return <ErrorState onAction={() => void requests.refetch()} />;
	return <AdminOverview requests={requests.data?.requests ?? []} />;
}

function FilePicker({
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

export function SupportNewRequest() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const search = useSearch({ from: "/support/new" });
	const createRequest = useCreateSupportRequest();
	const capabilities = useSupportCapabilities();
	const [topic, setTopic] = useState(search.topic ?? "connection");
	const [subject, setSubject] = useState("");
	const [message, setMessage] = useState("");
	const [files, setFiles] = useState<File[]>([]);
	const [fileError, setFileError] = useState<string | null>(null);
	const messageTooLong = message.length > 4000;
	const topicOptions = ["connection", "subscription", "devices", "payment", "other"].map(
		(value) => ({ value, label: topicLabel(t, value) }),
	);
	const submit = (event: FormEvent) => {
		event.preventDefault();
		if (messageTooLong) return;
		createRequest.mutate(
			{ topic, subject: subject.trim(), message: message.trim(), files },
			{
				onSuccess: (request) =>
					void navigate({
						to: "/support/requests/$requestId",
						params: { requestId: request.id },
						replace: true,
					}),
			},
		);
	};
	return (
		<div className={`${styles.page} ${styles.detailPage}`}>
			<div className={styles.pageHeading}>
				<h1>{t("support.new.title")}</h1>
				<p>{t("support.new.description")}</p>
			</div>
			<form className={styles.formCard} onSubmit={submit}>
				<FormSurfaceBody dataUi="support-new-fields">
					<FormField label={t("support.new.topic")} htmlFor="support-topic">
						<FormFieldSelect
							id="support-topic"
							value={topic}
							onChange={(event) => setTopic(event.target.value as SupportArticleTopic)}
							options={topicOptions}
						/>
					</FormField>
					<FormField label={t("support.new.subject")} htmlFor="support-subject">
						<FormFieldInput
							id="support-subject"
							value={subject}
							onChange={(event) => setSubject(event.target.value)}
							enterKeyHint="next"
							required
							maxLength={120}
						/>
					</FormField>
					<FormField label={t("support.new.message")} hint={t("support.new.safetyHint")}>
						<FormattedTextEditor
							id="support-message"
							ariaLabel={t("support.new.message")}
							value={message}
							onChange={setMessage}
							placeholder={t("support.new.messagePlaceholder")}
							maxLength={4000}
						/>
					</FormField>
					{messageTooLong && (
						<InlineFeedback attention="action">{t("support.formatLimitError")}</InlineFeedback>
					)}
					<FormField label={t("support.attachments.title")}>
						<FilePicker
							files={files}
							onFilesChange={setFiles}
							error={fileError}
							setError={setFileError}
							capabilities={capabilities.data}
							capabilitiesPending={capabilities.isPending}
						/>
					</FormField>
					{createRequest.error && (
						<InlineFeedback attention="action">{t("support.actions.createError")}</InlineFeedback>
					)}
					<ActionBtn
						type="submit"
						size="md"
						loading={createRequest.isPending}
						disabled={!subject.trim() || !message.trim() || messageTooLong}
					>
						<Send size={16} aria-hidden="true" />
						{t("support.new.send")}
					</ActionBtn>
				</FormSurfaceBody>
			</form>
			<aside className={styles.contextNotice}>
				<ShieldCheck size={20} aria-hidden="true" />
				<p>
					<strong>{t("support.new.contextTitle")}</strong>
					{t("support.new.contextDescription")}
				</p>
			</aside>
		</div>
	);
}

export function SupportAnswerPage() {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const { articleId } = useParams({ from: "/support/answers/$articleId" });
	const article = useSupportArticle(articleId);
	if (article.isPending) return <PageLoading />;
	if (article.error || !article.data) {
		return (
			<ErrorState
				variant="notFound"
				title={t("support.quickAnswers.notFoundTitle")}
				description={t("support.quickAnswers.notFoundDescription")}
				actionLabel={t("support.quickAnswers.notFoundAction")}
				onAction={() => void navigate({ to: "/support" })}
			/>
		);
	}
	const answer = article.data;
	return (
		<div className={`${styles.page} ${styles.detailPage}`}>
			<article className={styles.article}>
				<p className={styles.eyebrow}>{topicLabel(t, answer.topic)}</p>
				<h1>{answer.title}</h1>
				<p className={styles.articleSummary}>{answer.summary}</p>
				<FormattedText className={styles.articleBody}>{answer.body}</FormattedText>
			</article>
			<aside className={styles.articleCta}>
				<div>
					<strong>{t("support.answerCta.title")}</strong>
					<p>{t("support.answerCta.description")}</p>
				</div>
				<ActionBtn
					size="md"
					onClick={() => void navigate({ to: "/support/new", search: { topic: answer.topic } })}
				>
					<MessageSquarePlus size={16} />
					{t("support.answerCta.action")}
				</ActionBtn>
			</aside>
		</div>
	);
}

function AttachmentIcon({ attachment }: { attachment: SupportAttachment }) {
	const Icon = { image: Image, video: Video, text: FileText, zip: Archive }[attachment.kind];
	return <Icon size={17} aria-hidden="true" />;
}

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
					<div
						className={styles.thread}
						aria-label={t("support.request.conversation")}
						data-ui="support-conversation"
					>
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
													aria-label={t("support.attachments.download", { name: attachment.name })}
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
