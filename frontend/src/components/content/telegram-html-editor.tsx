import {
	Bold,
	Check,
	Italic,
	Link2,
	Quote,
	SmilePlus,
	Strikethrough,
	Underline,
	VenetianMask,
} from "lucide-react";
import { type KeyboardEvent, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FormFieldInput, FormFieldTextarea } from "../ui/form-section.tsx";
import styles from "./telegram-html-editor.module.css";

interface TelegramHtmlEditorProps {
	id: string;
	ariaLabel: string;
	value: string;
	onChange: (value: string) => void;
	maxLength: number;
	placeholder?: string;
}

export function TelegramHtmlEditor({
	id,
	ariaLabel,
	value,
	onChange,
	maxLength,
	placeholder,
}: TelegramHtmlEditorProps) {
	const { t } = useTranslation();
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const emojiIdInputId = useId();
	const [emojiOpen, setEmojiOpen] = useState(false);
	const [emojiId, setEmojiId] = useState("");
	const [emojiFallback, setEmojiFallback] = useState("✨");

	const replaceSelection = (open: string, close: string, fallback: string) => {
		const textarea = textareaRef.current;
		if (!textarea) return;
		const start = textarea.selectionStart;
		const end = textarea.selectionEnd;
		const selected = value.slice(start, end) || fallback;
		const next = `${value.slice(0, start)}${open}${selected}${close}${value.slice(end)}`;
		onChange(next);
		requestAnimationFrame(() => {
			textarea.focus();
			textarea.setSelectionRange(start + open.length, start + open.length + selected.length);
		});
	};

	const insertAtSelection = (inserted: string) => {
		const textarea = textareaRef.current;
		if (!textarea) return;
		const start = textarea.selectionStart;
		const end = textarea.selectionEnd;
		const position = start === end ? start : end;
		const next = `${value.slice(0, position)}${inserted}${value.slice(position)}`;
		onChange(next);
		requestAnimationFrame(() => {
			textarea.focus();
			const caret = position + inserted.length;
			textarea.setSelectionRange(caret, caret);
		});
	};

	const tools = [
		["common.telegramText.bold", Bold, "<b>", "</b>", t("common.telegramText.sample")],
		["common.telegramText.italic", Italic, "<i>", "</i>", t("common.telegramText.sample")],
		["common.telegramText.underline", Underline, "<u>", "</u>", t("common.telegramText.sample")],
		[
			"common.telegramText.strikethrough",
			Strikethrough,
			"<s>",
			"</s>",
			t("common.telegramText.sample"),
		],
		[
			"common.telegramText.spoiler",
			VenetianMask,
			"<tg-spoiler>",
			"</tg-spoiler>",
			t("common.telegramText.sample"),
		],
		[
			"common.telegramText.link",
			Link2,
			'<a href="https://">',
			"</a>",
			t("common.telegramText.linkSample"),
		],
		[
			"common.telegramText.quote",
			Quote,
			"<blockquote>",
			"</blockquote>",
			t("common.telegramText.quoteSample"),
		],
	] as const;

	const insertEmoji = () => {
		if (!/^\d{1,32}$/.test(emojiId) || !emojiFallback.trim()) return;
		insertAtSelection(`<tg-emoji emoji-id="${emojiId}">${emojiFallback.trim()}</tg-emoji>`);
		setEmojiOpen(false);
		setEmojiId("");
	};

	const handleEmojiKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.nativeEvent.isComposing || event.key !== "Enter") return;
		event.preventDefault();
		insertEmoji();
	};

	return (
		<div className={styles.editor}>
			<div className={styles.menu}>
				<div
					className={styles.toolbar}
					role="toolbar"
					aria-label={t("common.telegramText.toolbar")}
				>
					{tools.map(([labelKey, Icon, open, close, fallback]) => (
						<button
							key={labelKey}
							type="button"
							aria-label={t(labelKey)}
							title={t(labelKey)}
							onClick={() => replaceSelection(open, close, fallback)}
						>
							<Icon size={15} aria-hidden="true" />
						</button>
					))}
					<button
						type="button"
						aria-label={t("common.telegramText.customEmoji")}
						title={t("common.telegramText.customEmoji")}
						aria-expanded={emojiOpen}
						aria-controls={`${id}-emoji-editor`}
						onClick={() => setEmojiOpen((current) => !current)}
					>
						<SmilePlus size={15} aria-hidden="true" />
					</button>
				</div>
				{emojiOpen && (
					<div id={`${id}-emoji-editor`} className={styles.emojiEditor}>
						<FormFieldInput
							id={emojiIdInputId}
							enterKeyHint="next"
							inputMode="numeric"
							value={emojiId}
							aria-label={t("common.telegramText.emojiId")}
							placeholder={t("common.telegramText.emojiId")}
							onChange={(event) => setEmojiId(event.target.value.replace(/\D/g, "").slice(0, 32))}
						/>
						<FormFieldInput
							enterKeyHint="done"
							value={emojiFallback}
							maxLength={8}
							aria-label={t("common.telegramText.emojiFallback")}
							placeholder={t("common.telegramText.emojiFallbackPlaceholder")}
							onChange={(event) => setEmojiFallback(event.target.value)}
							onKeyDown={handleEmojiKeyDown}
						/>
						<button
							type="button"
							aria-label={t("common.telegramText.insertEmoji")}
							title={t("common.telegramText.insertEmoji")}
							disabled={!/^\d{1,32}$/.test(emojiId) || !emojiFallback.trim()}
							onClick={insertEmoji}
						>
							<Check size={15} aria-hidden="true" />
						</button>
					</div>
				)}
			</div>
			<FormFieldTextarea
				ref={textareaRef}
				id={id}
				value={value}
				aria-label={ariaLabel}
				maxLength={maxLength}
				placeholder={placeholder}
				rows={5}
				onChange={(event) => onChange(event.target.value)}
			/>
			<div className={styles.footer}>
				<span>{t("common.telegramText.htmlHint")}</span>
				<span>
					{t("common.telegramText.characterCount", { count: value.length, max: maxLength })}
				</span>
			</div>
		</div>
	);
}
