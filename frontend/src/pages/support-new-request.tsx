import { useNavigate, useSearch } from "@tanstack/react-router";
import { Send, ShieldCheck } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { FormattedTextEditor } from "../components/content/formatted-text-editor.tsx";
import { ActionBtn } from "../components/ui/action-btn.tsx";
import {
	FormField,
	FormFieldInput,
	FormFieldSelect,
	FormSurfaceBody,
} from "../components/ui/form-section.tsx";
import { InlineFeedback } from "../components/ui/inline-feedback.tsx";
import { useCreateSupportRequest, useSupportCapabilities } from "../hooks/use-support.ts";
import type { SupportArticleTopic } from "../types/support.ts";
import styles from "./support.module.css";
import { FilePicker, topicLabel } from "./support-shared.tsx";

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
						className={styles.newRequestSubmit}
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
