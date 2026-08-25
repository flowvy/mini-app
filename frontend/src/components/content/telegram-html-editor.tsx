import Placeholder from "@tiptap/extension-placeholder";
import {
	EditorContent,
	type JSONContent,
	Mark,
	Node,
	mergeAttributes,
	useEditor,
	useEditorState,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
	Bold,
	Check,
	Code2,
	Italic,
	Link2,
	Quote,
	SmilePlus,
	Strikethrough,
	Underline,
	Unlink,
	VenetianMask,
	X,
} from "lucide-react";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	normalizeTelegramTextLink,
	prepareTelegramHtmlForEditor,
	serializeTelegramHtml,
} from "../../lib/telegram-html.ts";
import { FormFieldInput } from "../ui/form-section.tsx";
import contentStyles from "./formatted-text.module.css";
import styles from "./telegram-html-editor.module.css";

const TelegramSpoiler = Mark.create({
	name: "telegramSpoiler",
	parseHTML: () => [{ tag: "tg-spoiler" }, { tag: 'span[class="tg-spoiler"]' }],
	renderHTML: () => ["tg-spoiler", 0],
});

const TelegramUnderline = Mark.create({
	name: "underline",
	parseHTML: () => [{ tag: "u" }, { tag: "ins" }],
	renderHTML: () => ["u", 0],
});

const TelegramBlockquote = Node.create({
	name: "blockquote",
	content: "block+",
	group: "block",
	defining: true,
	addAttributes() {
		return {
			expandable: {
				default: false,
				parseHTML: (element) => element.hasAttribute("expandable"),
			},
		};
	},
	parseHTML: () => [{ tag: "blockquote" }],
	renderHTML: ({ node }) => ["blockquote", node.attrs.expandable ? { expandable: "" } : {}, 0],
});

const TelegramEmoji = Node.create({
	name: "telegramEmoji",
	group: "inline",
	inline: true,
	atom: true,
	selectable: true,
	marks: "",
	addAttributes() {
		return {
			emojiId: { default: "", parseHTML: (element) => element.getAttribute("emoji-id") ?? "" },
			fallback: { default: "", parseHTML: (element) => element.textContent ?? "" },
		};
	},
	parseHTML: () => [{ tag: "tg-emoji[emoji-id]" }],
	renderHTML({ node }) {
		return [
			"tg-emoji",
			mergeAttributes({
				"data-telegram-emoji": "true",
				"emoji-id": node.attrs.emojiId,
			}),
			node.attrs.fallback,
		];
	},
	renderText: ({ node }) => node.attrs.fallback,
});

interface TelegramHtmlEditorProps {
	id: string;
	ariaLabel: string;
	value: string;
	onChange: (value: string) => void;
	maxLength: number;
	placeholder?: string;
	allowCustomEmoji?: boolean;
}

interface EditorViewState {
	bold: boolean;
	italic: boolean;
	underline: boolean;
	strike: boolean;
	code: boolean;
	spoiler: boolean;
	link: boolean;
	blockquote: boolean;
}

const EMPTY_VIEW_STATE: EditorViewState = {
	bold: false,
	italic: false,
	underline: false,
	strike: false,
	code: false,
	spoiler: false,
	link: false,
	blockquote: false,
};

export function TelegramHtmlEditor({
	id,
	ariaLabel,
	value,
	onChange,
	maxLength,
	placeholder = "",
	allowCustomEmoji = true,
}: TelegramHtmlEditorProps) {
	const { t } = useTranslation();
	const emojiIdInputId = useId();
	const linkInputId = useId();
	const acceptedContentRef = useRef<JSONContent | null>(null);
	const [emojiOpen, setEmojiOpen] = useState(false);
	const [emojiId, setEmojiId] = useState("");
	const [emojiFallback, setEmojiFallback] = useState("");
	const [linkEditorOpen, setLinkEditorOpen] = useState(false);
	const [linkDraft, setLinkDraft] = useState("");
	const [linkError, setLinkError] = useState(false);
	const [activeTool, setActiveTool] = useState(0);
	const toolRefs = useRef<Array<HTMLButtonElement | null>>([]);

	const editor = useEditor(
		{
			immediatelyRender: false,
			content: prepareTelegramHtmlForEditor(value),
			extensions: [
				StarterKit.configure({
					blockquote: false,
					bulletList: false,
					heading: false,
					horizontalRule: false,
					listItem: false,
					orderedList: false,
					underline: false,
					link: { autolink: false, openOnClick: false, enableClickSelection: true },
				}),
				TelegramSpoiler,
				TelegramUnderline,
				TelegramBlockquote,
				TelegramEmoji,
				Placeholder.configure({ placeholder }),
			],
			editorProps: {
				attributes: {
					id,
					class: `${contentStyles.content} ${styles.contentEditable}`,
					role: "textbox",
					"aria-label": ariaLabel,
					"aria-multiline": "true",
					"aria-describedby": `${id}-telegram-text-hint`,
					enterkeyhint: "enter",
				},
			},
			onCreate: ({ editor: currentEditor }) => {
				acceptedContentRef.current = currentEditor.getJSON();
			},
			onUpdate: ({ editor: currentEditor }) => {
				const next = serializeTelegramHtml(currentEditor.getJSON());
				if (next.length > maxLength && acceptedContentRef.current) {
					currentEditor.commands.setContent(acceptedContentRef.current, { emitUpdate: false });
					return;
				}
				acceptedContentRef.current = currentEditor.getJSON();
				onChange(next);
			},
		},
		[id, maxLength, placeholder],
	);

	useEffect(() => {
		if (!editor || serializeTelegramHtml(editor.getJSON()) === value) return;
		editor.commands.setContent(prepareTelegramHtmlForEditor(value), { emitUpdate: false });
		acceptedContentRef.current = editor.getJSON();
	}, [editor, value]);

	const viewState =
		useEditorState({
			editor,
			selector: ({ editor: currentEditor }): EditorViewState =>
				currentEditor
					? {
							bold: currentEditor.isActive("bold"),
							italic: currentEditor.isActive("italic"),
							underline: currentEditor.isActive("underline"),
							strike: currentEditor.isActive("strike"),
							code: currentEditor.isActive("code"),
							spoiler: currentEditor.isActive("telegramSpoiler"),
							link: currentEditor.isActive("link"),
							blockquote: currentEditor.isActive("blockquote"),
						}
					: EMPTY_VIEW_STATE,
		}) ?? EMPTY_VIEW_STATE;

	const closeLinkEditor = () => {
		setLinkEditorOpen(false);
		setLinkError(false);
		editor?.chain().focus().run();
	};
	const openLinkEditor = () => {
		if (!editor) return;
		setLinkDraft(String(editor.getAttributes("link").href ?? "") || "https://");
		setLinkError(false);
		setLinkEditorOpen(true);
		setEmojiOpen(false);
		requestAnimationFrame(() => document.getElementById(linkInputId)?.focus());
	};
	const applyLink = () => {
		if (!editor) return;
		const href = normalizeTelegramTextLink(linkDraft);
		if (!href) {
			setLinkError(true);
			return;
		}
		editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
		setLinkEditorOpen(false);
		setLinkError(false);
	};
	const removeLink = () => {
		editor?.chain().focus().extendMarkRange("link").unsetLink().run();
		setLinkEditorOpen(false);
		setLinkError(false);
	};
	const handleLinkKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.nativeEvent.isComposing) return;
		if (event.key === "Enter") {
			event.preventDefault();
			applyLink();
		}
		if (event.key === "Escape") {
			event.preventDefault();
			closeLinkEditor();
		}
	};

	const tools = [
		{
			key: "bold",
			label: t("common.telegramText.bold"),
			active: viewState.bold,
			icon: <Bold size={15} aria-hidden="true" />,
			run: () => editor?.chain().focus().toggleBold().run(),
		},
		{
			key: "italic",
			label: t("common.telegramText.italic"),
			active: viewState.italic,
			icon: <Italic size={15} aria-hidden="true" />,
			run: () => editor?.chain().focus().toggleItalic().run(),
		},
		{
			key: "underline",
			label: t("common.telegramText.underline"),
			active: viewState.underline,
			icon: <Underline size={15} aria-hidden="true" />,
			run: () => editor?.chain().focus().toggleMark("underline").run(),
		},
		{
			key: "strike",
			label: t("common.telegramText.strikethrough"),
			active: viewState.strike,
			icon: <Strikethrough size={15} aria-hidden="true" />,
			run: () => editor?.chain().focus().toggleStrike().run(),
		},
		{
			key: "code",
			label: t("common.telegramText.monospace"),
			active: viewState.code,
			icon: <Code2 size={15} aria-hidden="true" />,
			run: () => editor?.chain().focus().toggleCode().run(),
		},
		{
			key: "spoiler",
			label: t("common.telegramText.spoiler"),
			active: viewState.spoiler,
			icon: <VenetianMask size={15} aria-hidden="true" />,
			run: () => editor?.chain().focus().toggleMark("telegramSpoiler").run(),
		},
		{
			key: "link",
			label: t("common.telegramText.link"),
			active: viewState.link,
			icon: <Link2 size={15} aria-hidden="true" />,
			run: openLinkEditor,
		},
		{
			key: "quote",
			label: t("common.telegramText.quote"),
			active: viewState.blockquote,
			icon: <Quote size={15} aria-hidden="true" />,
			run: () => editor?.chain().focus().toggleWrap("blockquote").run(),
		},
	];
	const toolbarItemCount = tools.length + (allowCustomEmoji ? 1 : 0);
	const moveToolbarFocus = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
		let target: number | null = null;
		if (event.key === "ArrowRight") target = (index + 1) % toolbarItemCount;
		if (event.key === "ArrowLeft") target = (index - 1 + toolbarItemCount) % toolbarItemCount;
		if (event.key === "Home") target = 0;
		if (event.key === "End") target = toolbarItemCount - 1;
		if (target === null) return;
		event.preventDefault();
		setActiveTool(target);
		toolRefs.current[target]?.focus();
	};

	const insertEmoji = () => {
		const fallback = emojiFallback.trim();
		if (!editor || !/^\d{1,32}$/.test(emojiId) || !fallback) return;
		editor
			.chain()
			.focus()
			.insertContent({ type: "telegramEmoji", attrs: { emojiId, fallback } })
			.run();
		setEmojiOpen(false);
		setEmojiId("");
		setEmojiFallback("");
	};
	const handleEmojiKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.nativeEvent.isComposing || event.key !== "Enter") return;
		event.preventDefault();
		insertEmoji();
	};

	if (!editor) return <div className={styles.editorPlaceholder} aria-hidden="true" />;
	const sourceLength = serializeTelegramHtml(editor.getJSON()).length;

	return (
		<div className={styles.editor} data-ui="telegram-html-editor">
			<div className={styles.menu}>
				<div
					className={styles.toolbar}
					role="toolbar"
					aria-label={t("common.telegramText.toolbar")}
					aria-controls={id}
				>
					{tools.map((tool, index) => (
						<button
							key={tool.key}
							ref={(element) => {
								toolRefs.current[index] = element;
							}}
							type="button"
							aria-label={tool.label}
							title={tool.label}
							aria-pressed={tool.active}
							tabIndex={index === activeTool ? 0 : -1}
							onFocus={() => setActiveTool(index)}
							onKeyDown={(event) => moveToolbarFocus(event, index)}
							onClick={tool.run}
						>
							{tool.icon}
						</button>
					))}
					{allowCustomEmoji && (
						<button
							ref={(element) => {
								toolRefs.current[tools.length] = element;
							}}
							type="button"
							aria-label={t("common.telegramText.customEmoji")}
							title={t("common.telegramText.customEmoji")}
							aria-expanded={emojiOpen}
							aria-controls={`${id}-emoji-editor`}
							tabIndex={activeTool === tools.length ? 0 : -1}
							onFocus={() => setActiveTool(tools.length)}
							onKeyDown={(event) => moveToolbarFocus(event, tools.length)}
							onClick={() => {
								setEmojiOpen((current) => !current);
								setLinkEditorOpen(false);
								setLinkError(false);
							}}
						>
							<SmilePlus size={15} aria-hidden="true" />
						</button>
					)}
				</div>
				{linkEditorOpen && (
					<fieldset className={styles.inlineEditor}>
						<legend>{t("common.telegramText.linkAddress")}</legend>
						<div className={styles.inlineEditorRow}>
							<input
								id={linkInputId}
								type="url"
								inputMode="url"
								enterKeyHint="done"
								autoCapitalize="none"
								autoCorrect="off"
								spellCheck={false}
								aria-label={t("common.telegramText.linkAddress")}
								value={linkDraft}
								aria-invalid={linkError}
								onChange={(event) => {
									setLinkDraft(event.target.value);
									setLinkError(false);
								}}
								onKeyDown={handleLinkKeyDown}
							/>
							<button
								type="button"
								aria-label={t("common.telegramText.applyLink")}
								onClick={applyLink}
							>
								<Check size={15} aria-hidden="true" />
							</button>
							{viewState.link && (
								<button
									type="button"
									aria-label={t("common.telegramText.removeLink")}
									onClick={removeLink}
								>
									<Unlink size={15} aria-hidden="true" />
								</button>
							)}
							<button type="button" aria-label={t("common.cancel")} onClick={closeLinkEditor}>
								<X size={15} aria-hidden="true" />
							</button>
						</div>
						{linkError && (
							<span className={styles.inlineError} role="alert">
								{t("common.telegramText.invalidLink")}
							</span>
						)}
					</fieldset>
				)}
				{allowCustomEmoji && emojiOpen && (
					<fieldset id={`${id}-emoji-editor`} className={styles.inlineEditor}>
						<legend>{t("common.telegramText.customEmoji")}</legend>
						<div className={styles.emojiEditorRow}>
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
					</fieldset>
				)}
			</div>
			<EditorContent editor={editor} className={styles.surface} />
			<div id={`${id}-telegram-text-hint`} className={styles.footer}>
				<span>{t("common.telegramText.formatHint")}</span>
				<span aria-live="polite">
					{t("common.telegramText.characterCount", {
						count: sourceLength,
						max: maxLength,
					})}
				</span>
			</div>
		</div>
	);
}
