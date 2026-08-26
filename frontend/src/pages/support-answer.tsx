import { useNavigate, useParams } from "@tanstack/react-router";
import { MessageSquarePlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { FormattedText } from "../components/content/formatted-text.tsx";
import { ActionBtn } from "../components/ui/action-btn.tsx";
import { ErrorState } from "../components/ui/error-state.tsx";
import { PageLoading } from "../components/ui/page-loading.tsx";
import { useSupportArticle } from "../hooks/use-support.ts";
import styles from "./support.module.css";
import { topicLabel } from "./support-shared.tsx";

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
