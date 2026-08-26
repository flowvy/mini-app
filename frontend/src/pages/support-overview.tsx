import { useNavigate } from "@tanstack/react-router";
import {
	BookOpenText,
	ChevronRight,
	CircleAlert,
	CircleCheck,
	CircleHelp,
	Clock3,
	CreditCard,
	MessageSquarePlus,
	RefreshCw,
	Search,
	Smartphone,
	WifiOff,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useCurrentUser } from "../components/auth-guard.tsx";
import { ActionBtn } from "../components/ui/action-btn.tsx";
import { ErrorState } from "../components/ui/error-state.tsx";
import { FormSection, FormSectionCard } from "../components/ui/form-section.tsx";
import { InlineFeedback } from "../components/ui/inline-feedback.tsx";
import { PageLoading } from "../components/ui/page-loading.tsx";
import { SegmentedControl } from "../components/ui/segmented-control.tsx";
import { useSupportArticles, useSupportRequests } from "../hooks/use-support.ts";
import { handleImeKeyDown } from "../lib/ime.ts";
import type {
	SupportArticle,
	SupportArticleTopic,
	SupportRequestStatus,
	SupportRequestSummary,
} from "../types/support.ts";
import styles from "./support.module.css";
import { formatUpdatedAt, StatusPill } from "./support-shared.tsx";

function RequestStatusIcon({ status, admin }: { status: SupportRequestStatus; admin: boolean }) {
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
}: {
	request: SupportRequestSummary;
	admin?: boolean;
}) {
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
						<b>
							<span className={styles.srOnly}>
								{t("support.requests.unread", { count: request.unreadCount })}
							</span>
							<span aria-hidden="true">{request.unreadCount}</span>
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
						{answers.map((answer) => (
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
						))}
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
