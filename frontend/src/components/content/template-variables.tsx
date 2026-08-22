import { copyTextToClipboard } from "@telegram-apps/sdk-react";
import { Check, ChevronDown, Copy } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import styles from "./template-variables.module.css";

interface TemplateVariablesProps {
	variables: readonly string[];
	scopes?: Readonly<Record<string, readonly string[]>>;
}

const VARIABLE_DESCRIPTION_KEYS: Record<string, string> = {
	appName: "common.templates.variables.appName",
	code: "common.templates.variables.code",
};

export function TemplateVariables({ variables, scopes = {} }: TemplateVariablesProps) {
	const { t } = useTranslation();
	const [copied, setCopied] = useState<string | null>(null);
	const [copyFailed, setCopyFailed] = useState(false);

	if (variables.length === 0) return null;

	const copy = async (variable: string) => {
		const token = `{{${variable}}}`;
		try {
			setCopyFailed(false);
			await copyTextToClipboard(token);
			setCopied(variable);
			window.setTimeout(
				() => setCopied((current) => (current === variable ? null : current)),
				1600,
			);
		} catch {
			setCopied(null);
			setCopyFailed(true);
		}
	};

	return (
		<details className={styles.disclosure}>
			<summary>
				<span>{t("common.templates.title")}</span>
				<ChevronDown size={13} aria-hidden="true" />
			</summary>
			<div className={styles.body}>
				<p>{t("common.templates.hint")}</p>
				<div className={styles.variables}>
					{variables.map((variable) => {
						const isCopied = copied === variable;
						return (
							<button
								key={variable}
								type="button"
								className={styles.variable}
								onClick={() => void copy(variable)}
								aria-label={t("common.templates.copyLabel", {
									token: `{{${variable}}}`,
								})}
							>
								<code>{`{{${variable}}}`}</code>
								<span className={styles.variableDescription}>
									<span>
										{t(VARIABLE_DESCRIPTION_KEYS[variable] ?? "common.templates.variable")}
									</span>
									{scopes[variable]?.length ? (
										<small>
											{t("common.templates.availableIn", {
												fields: scopes[variable].join(", "),
											})}
										</small>
									) : null}
								</span>
								{isCopied ? (
									<Check size={13} aria-hidden="true" />
								) : (
									<Copy size={13} aria-hidden="true" />
								)}
							</button>
						);
					})}
				</div>
				<span className={styles.feedback} aria-live="polite">
					{copied
						? t("common.templates.copied", { token: `{{${copied}}}` })
						: copyFailed
							? t("common.templates.copyFailed")
							: ""}
				</span>
			</div>
		</details>
	);
}
