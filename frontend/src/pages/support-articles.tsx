import { useBlocker, useNavigate, useParams } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, BookOpenText, Pencil, Plus } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCurrentUser } from "../components/auth-guard.tsx";
import { FormattedTextEditor } from "../components/content/formatted-text-editor.tsx";
import { ActionBtn } from "../components/ui/action-btn.tsx";
import { ConfirmDialog } from "../components/ui/confirm-dialog.tsx";
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
	useAdminSupportArticle,
	useAdminSupportArticles,
	useCreateSupportArticle,
	useDeleteSupportArticle,
	useReorderSupportArticles,
	useUpdateSupportArticle,
} from "../hooks/use-support.ts";
import { localeLabel, SUPPORTED_LOCALES } from "../i18n";
import type {
	SupportArticleAdmin,
	SupportArticleInput,
	SupportArticleLocale,
	SupportArticleStatus,
	SupportArticleTopic,
} from "../types/support.ts";
import styles from "./support.module.css";

type SupportArticleLocaleDraft = Omit<SupportArticleLocale, "searchAliases"> & {
	searchAliases: string;
};

const EMPTY_CONTENT: SupportArticleLocaleDraft = {
	title: "",
	summary: "",
	body: "",
	searchAliases: "",
};

function normalizedLocales(
	locales: Record<string, SupportArticleLocale>,
): Record<string, SupportArticleLocaleDraft> {
	return Object.fromEntries(
		Object.entries(locales).map(([locale, content]) => [
			locale,
			{ ...content, searchAliases: (content.searchAliases ?? []).join(", ") },
		]),
	);
}

function serializedLocales(
	locales: Record<string, SupportArticleLocaleDraft>,
): Record<string, SupportArticleLocale> {
	return Object.fromEntries(
		Object.entries(locales).map(([locale, content]) => [
			locale,
			{
				...content,
				searchAliases: content.searchAliases
					.split(",")
					.map((alias) => alias.trim())
					.filter(Boolean),
			},
		]),
	);
}

function articleTitle(article: SupportArticleAdmin, requestedLocale: string): string {
	const normalizedLocale = requestedLocale.trim().replaceAll("_", "-").toLowerCase();
	const baseLocale = normalizedLocale.split("-")[0];
	const localizedEntries = Object.entries(article.contentLocales);
	for (const candidate of [normalizedLocale, baseLocale, "en"]) {
		const content = localizedEntries.find(([locale]) => locale.toLowerCase() === candidate)?.[1];
		if (content?.title) return content.title;
	}
	return localizedEntries.find(([, content]) => content.title)?.[1].title ?? "";
}

function ArticleStatus({ status }: { status: SupportArticleStatus }) {
	const { t } = useTranslation();
	const label = {
		draft: t("support.manage.status.draft"),
		published: t("support.manage.status.published"),
		archived: t("support.manage.status.archived"),
	}[status];
	return (
		<span className={styles.articleStatus} data-status={status}>
			<span aria-hidden="true" />
			{label}
		</span>
	);
}

function AdminOnly({ children }: { children: React.ReactNode }) {
	const user = useCurrentUser();
	const navigate = useNavigate();
	if (user.role !== "admin") {
		return <ErrorState variant="forbidden" onAction={() => void navigate({ to: "/support" })} />;
	}
	return children;
}

export function SupportArticlesAdmin() {
	return (
		<AdminOnly>
			<SupportArticlesAdminContent />
		</AdminOnly>
	);
}

function SupportArticlesAdminContent() {
	const { t, i18n } = useTranslation();
	const navigate = useNavigate();
	const articles = useAdminSupportArticles();
	const reorder = useReorderSupportArticles();
	if (articles.isPending) return <PageLoading />;
	if (articles.error || !articles.data) {
		return <ErrorState onAction={() => void articles.refetch()} />;
	}
	const list = articles.data.articles;
	const displayLocale = i18n.resolvedLanguage || i18n.language;
	const move = (index: number, offset: -1 | 1) => {
		const target = index + offset;
		if (target < 0 || target >= list.length) return;
		const ordered = list.map((article) => article.id);
		[ordered[index], ordered[target]] = [ordered[target], ordered[index]];
		reorder.mutate(ordered);
	};
	return (
		<div className={`${styles.page} ${styles.detailPage}`} data-support-manage="list">
			<FormSection
				title={t("support.manage.articles")}
				action={
					<ActionBtn
						variant="action"
						size="sm"
						onClick={() => void navigate({ to: "/support/manage/answers/new" })}
					>
						<Plus size={15} aria-hidden="true" />
						{t("support.manage.create")}
					</ActionBtn>
				}
			>
				<FormSectionCard>
					{list.map((article, index) => {
						const title = articleTitle(article, displayLocale);
						return (
							<div key={article.id} className={styles.managementRow}>
								<span className={styles.answerIcon} aria-hidden="true">
									<BookOpenText size={18} />
								</span>
								<span className={styles.managementCopy}>
									<strong>{title || t("support.manage.untitled")}</strong>
									<ArticleStatus status={article.status} />
								</span>
								<span className={styles.managementActions}>
									<button
										type="button"
										disabled={index === 0 || reorder.isPending}
										onClick={() => move(index, -1)}
										aria-label={t("support.manage.moveUp", {
											title: title || t("support.manage.untitled"),
										})}
									>
										<ArrowUp size={15} aria-hidden="true" />
									</button>
									<button
										type="button"
										disabled={index === list.length - 1 || reorder.isPending}
										onClick={() => move(index, 1)}
										aria-label={t("support.manage.moveDown", {
											title: title || t("support.manage.untitled"),
										})}
									>
										<ArrowDown size={15} aria-hidden="true" />
									</button>
									<button
										type="button"
										onClick={() =>
											void navigate({
												to: "/support/manage/answers/$articleId",
												params: { articleId: article.id },
											})
										}
										aria-label={t("support.manage.edit", {
											title: title || t("support.manage.untitled"),
										})}
									>
										<Pencil size={15} aria-hidden="true" />
									</button>
								</span>
							</div>
						);
					})}
					{list.length === 0 && (
						<div className={styles.managementEmpty}>
							<BookOpenText size={24} aria-hidden="true" />
							<strong>{t("support.manage.empty")}</strong>
							<p>{t("support.manage.emptyDescription")}</p>
						</div>
					)}
				</FormSectionCard>
			</FormSection>
			{reorder.error && (
				<InlineFeedback attention="action">{t("support.manage.reorderError")}</InlineFeedback>
			)}
		</div>
	);
}

export function SupportArticleNew() {
	return (
		<AdminOnly>
			<ArticleEditor />
		</AdminOnly>
	);
}

export function SupportArticleEdit() {
	const { articleId } = useParams({ from: "/support/manage/answers/$articleId" });
	return (
		<AdminOnly>
			<ArticleEditorLoader articleId={articleId} />
		</AdminOnly>
	);
}

function ArticleEditorLoader({ articleId }: { articleId: string }) {
	const article = useAdminSupportArticle(articleId);
	if (article.isPending) return <PageLoading />;
	if (article.error || !article.data) return <ErrorState onAction={() => void article.refetch()} />;
	return <ArticleEditor key={article.data.updatedAt} article={article.data} />;
}

interface EditorDraft {
	topic: SupportArticleTopic;
	status: SupportArticleStatus;
	contentLocales: Record<string, SupportArticleLocaleDraft>;
}

function draftFromArticle(article?: SupportArticleAdmin): EditorDraft {
	const defaultLocale = SUPPORTED_LOCALES[0] ?? "en";
	return article
		? {
				topic: article.topic,
				status: article.status,
				contentLocales: normalizedLocales(structuredClone(article.contentLocales)),
			}
		: {
				topic: "connection",
				status: "draft",
				contentLocales: { [defaultLocale]: { ...EMPTY_CONTENT } },
			};
}

function ArticleEditor({ article }: { article?: SupportArticleAdmin }) {
	const { t, i18n } = useTranslation();
	const navigate = useNavigate();
	const create = useCreateSupportArticle();
	const update = useUpdateSupportArticle();
	const remove = useDeleteSupportArticle();
	const [draft, setDraft] = useState(() => draftFromArticle(article));
	const [baseline, setBaseline] = useState(() => draftFromArticle(article));
	const [locale, setLocale] = useState(SUPPORTED_LOCALES[0] ?? "en");
	const [deleteConfirmation, setDeleteConfirmation] = useState(false);
	const allowNavigationRef = useRef(false);
	const deleteTriggerRef = useRef<HTMLButtonElement>(null);
	const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
	const blocker = useBlocker({
		shouldBlockFn: () => dirty && !allowNavigationRef.current,
		enableBeforeUnload: dirty,
		withResolver: true,
	});
	const mutation = article ? update : create;
	const current = draft.contentLocales[locale] ?? EMPTY_CONTENT;
	const defaultLocale = SUPPORTED_LOCALES[0] ?? "en";
	const defaultContent = draft.contentLocales[defaultLocale] ?? EMPTY_CONTENT;
	const canPublish = Boolean(defaultContent.title && defaultContent.summary && defaultContent.body);
	const statusDescription = {
		draft: t("support.manage.editor.statusDescription.draft"),
		published: t("support.manage.editor.statusDescription.published"),
		archived: t("support.manage.editor.statusDescription.archived"),
	}[draft.status];
	const statusOptions = {
		draft: ["draft", "published"],
		published: ["draft", "published", "archived"],
		archived: ["draft", "archived"],
	}[baseline.status].map((value) => ({
		value,
		label: t(`support.manage.status.${value}`),
	}));
	const updateDraft = (next: EditorDraft) => {
		allowNavigationRef.current = false;
		setDraft(next);
	};
	const updateContent = (field: keyof SupportArticleLocaleDraft, value: string) => {
		updateDraft({
			...draft,
			contentLocales: {
				...draft.contentLocales,
				[locale]: { ...current, [field]: value },
			},
		});
	};
	const save = async (status: SupportArticleStatus) => {
		const input: SupportArticleInput = {
			topic: draft.topic,
			status,
			contentLocales: serializedLocales(draft.contentLocales),
		};
		try {
			const saved = article
				? await update.mutateAsync({ articleId: article.id, input })
				: await create.mutateAsync(input);
			const next = draftFromArticle(saved);
			setDraft(next);
			setBaseline(next);
			if (!article) {
				allowNavigationRef.current = true;
				void navigate({
					to: "/support/manage/answers/$articleId",
					params: { articleId: saved.id },
					replace: true,
				});
			}
		} catch {
			// The localized persistent action error below owns the failure state.
		}
	};
	const deleteArticle = async () => {
		if (!article) return;
		try {
			await remove.mutateAsync(article.id);
			setDeleteConfirmation(false);
			allowNavigationRef.current = true;
			void navigate({ to: "/support/manage/answers", replace: true });
		} catch {
			// The localized persistent action error in the confirmation owns the failure state.
		}
	};
	const topicOptions: Array<{ value: SupportArticleTopic; label: string }> = [
		"connection",
		"subscription",
		"devices",
		"payment",
		"other",
	].map((value) => ({ value: value as SupportArticleTopic, label: t(`support.topics.${value}`) }));
	const localeOptions = SUPPORTED_LOCALES.map((value) => ({
		key: value,
		label: localeLabel(value, i18n.resolvedLanguage || i18n.language),
	}));
	return (
		<div className={`${styles.page} ${styles.detailPage}`} data-support-manage="editor">
			<p className={styles.managementIntro}>{t("support.manage.editor.description")}</p>
			<FormSection title={t("support.manage.editor.details")}>
				<FormSectionCard>
					<FormSurfaceBody dataUi="support-article-fields">
						<FormField label={t("support.manage.editor.topic")} htmlFor="support-article-topic">
							<FormFieldSelect
								id="support-article-topic"
								value={draft.topic}
								options={topicOptions}
								onChange={(event) =>
									updateDraft({ ...draft, topic: event.target.value as SupportArticleTopic })
								}
							/>
						</FormField>
						<FormField
							label={t("support.manage.editor.statusLabel")}
							htmlFor="support-article-status"
							hint={statusDescription}
						>
							<FormFieldSelect
								id="support-article-status"
								value={draft.status}
								options={statusOptions}
								onChange={(event) =>
									updateDraft({ ...draft, status: event.target.value as SupportArticleStatus })
								}
							/>
						</FormField>
						<FormField label={t("support.manage.editor.language")}>
							<SegmentedControl
								value={locale}
								options={localeOptions}
								onChange={setLocale}
								ariaLabel={t("support.manage.editor.language")}
							/>
						</FormField>
						<FormField
							label={t("support.manage.editor.articleTitle")}
							htmlFor="support-article-title"
						>
							<FormFieldInput
								id="support-article-title"
								enterKeyHint="next"
								value={current.title}
								maxLength={120}
								onChange={(event) => updateContent("title", event.target.value)}
							/>
						</FormField>
						<FormField
							label={t("support.manage.editor.summary")}
							htmlFor="support-article-summary"
							hint={t("support.manage.editor.summaryHint")}
						>
							<FormFieldInput
								id="support-article-summary"
								enterKeyHint="next"
								value={current.summary}
								maxLength={240}
								onChange={(event) => updateContent("summary", event.target.value)}
							/>
						</FormField>
						<FormField
							label={t("support.manage.editor.searchAliases")}
							htmlFor="support-article-search-aliases"
							hint={t("support.manage.editor.searchAliasesHint")}
						>
							<FormFieldInput
								id="support-article-search-aliases"
								value={current.searchAliases}
								enterKeyHint="next"
								maxLength={2_419}
								onChange={(event) => updateContent("searchAliases", event.target.value)}
							/>
						</FormField>
						<FormField label={t("support.manage.editor.body")}>
							<FormattedTextEditor
								id="support-article-body"
								ariaLabel={t("support.manage.editor.body")}
								value={current.body}
								maxLength={10_000}
								placeholder={t("support.manage.editor.bodyPlaceholder")}
								onChange={(value) => updateContent("body", value)}
							/>
						</FormField>
						{draft.status === "published" && !canPublish && (
							<InlineFeedback>{t("support.manage.editor.publishRequirements")}</InlineFeedback>
						)}
						{mutation.error && (
							<InlineFeedback attention="action">
								{t("support.manage.editor.saveError")}
							</InlineFeedback>
						)}
						<div className={styles.editorActions} data-ui="article-content-actions">
							{article && (
								<ActionBtn
									ref={deleteTriggerRef}
									variant="ghost"
									size="sm"
									disabled={mutation.isPending}
									onClick={() => {
										remove.reset();
										setDeleteConfirmation(true);
									}}
								>
									{t("support.manage.editor.deleteArticle")}
								</ActionBtn>
							)}
							<ActionBtn
								size="md"
								loading={mutation.isPending}
								disabled={!dirty || (draft.status === "published" && !canPublish)}
								onClick={() => void save(draft.status)}
							>
								{article
									? t("support.manage.editor.saveChanges")
									: draft.status === "published"
										? t("support.manage.editor.publish")
										: t("support.manage.editor.saveDraft")}
							</ActionBtn>
						</div>
					</FormSurfaceBody>
				</FormSectionCard>
			</FormSection>
			<ConfirmDialog
				open={deleteConfirmation}
				title={t("support.manage.editor.deleteTitle")}
				confirmLabel={t("support.manage.editor.delete")}
				cancelLabel={t("common.cancel")}
				telegramNativeMessage={
					remove.error
						? `${t("support.manage.editor.deleteError")}\n\n${t("support.manage.editor.deleteDescription")}`
						: t("support.manage.editor.deleteDescription")
				}
				confirmVariant="danger"
				confirmLoading={remove.isPending}
				initialFocus="cancel"
				returnFocusRef={deleteTriggerRef}
				alert
				onConfirm={() => void deleteArticle()}
				onCancel={() => {
					remove.reset();
					setDeleteConfirmation(false);
				}}
			>
				<p>{t("support.manage.editor.deleteDescription")}</p>
				{remove.error && (
					<InlineFeedback attention="action">
						{t("support.manage.editor.deleteError")}
					</InlineFeedback>
				)}
			</ConfirmDialog>
			<ConfirmDialog
				open={blocker.status === "blocked"}
				title={t("support.manage.editor.discardTitle")}
				confirmLabel={t("support.manage.editor.discard")}
				cancelLabel={t("common.cancel")}
				telegramNativeMessage={t("support.manage.editor.discardDescription")}
				confirmVariant="danger"
				initialFocus="cancel"
				onConfirm={() => blocker.proceed?.()}
				onCancel={() => blocker.reset?.()}
			>
				<p>{t("support.manage.editor.discardDescription")}</p>
			</ConfirmDialog>
		</div>
	);
}
