import { ChevronDown } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { FormattedText } from "../components/content/formatted-text.tsx";
import type { SupportArticle } from "../types/support.ts";
import styles from "./support-article-suggestions.module.css";

export function SupportArticleSuggestions({ articles }: { articles: SupportArticle[] }) {
	const { t } = useTranslation();
	const titleId = useId();

	return (
		<>
			<div className={styles.status} role="status" aria-live="polite" aria-atomic="true">
				{articles.length > 0 ? t("support.new.suggestionsStatus", { count: articles.length }) : ""}
			</div>
			{articles.length > 0 && (
				<section className={styles.suggestions} aria-labelledby={titleId}>
					<header>
						<h2 id={titleId}>{t("support.new.suggestionsTitle")}</h2>
						<p>{t("support.new.suggestionsDescription")}</p>
					</header>
					<div className={styles.list}>
						{articles.map((article) => (
							<details key={article.id} className={styles.suggestion}>
								<summary>
									<span>
										<strong>{article.title}</strong>
										<small>{article.summary}</small>
									</span>
									<ChevronDown size={16} aria-hidden="true" />
								</summary>
								<FormattedText className={styles.body}>{article.body}</FormattedText>
							</details>
						))}
					</div>
				</section>
			)}
		</>
	);
}
