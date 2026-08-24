import CharacterCount from "@tiptap/extension-character-count";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "@tiptap/markdown";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
	Bold as BoldIcon,
	Check,
	Italic as ItalicIcon,
	Link2,
	List,
	ListOrdered,
	Quote,
	Strikethrough,
	Unlink,
	X,
} from "lucide-react";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { normalizeFormattedTextLink } from "../../lib/formatted-text.ts";
import styles from "./formatted-text-editor.module.css";
import contentStyles from "./formatted-text.module.css";

interface FormattedTextEditorProps {
	id: string;
	ariaLabel: string;
	value: string;
	onChange: (value: string) => void;
	maxLength: number;
	placeholder?: string;
	disabled?: boolean;
}

interface EditorViewState {
	characters: number;
	bold: boolean;
	italic: boolean;
	strike: boolean;
	link: boolean;
	bulletList: boolean;
	orderedList: boolean;
	blockquote: boolean;
}

const EMPTY_VIEW_STATE: EditorViewState = {
	characters: 0,
	bold: false,
	italic: false,
	strike: false,
	link: false,
	bulletList: false,
	orderedList: false,
	blockquote: false,
};

export function FormattedTextEditor({
	id,
	ariaLabel,
	value,
	onChange,
	maxLength,
	placeholder = "",
	disabled = false,
}: FormattedTextEditorProps) {
	const { t } = useTranslation();
	const linkInputId = useId();
	const [linkEditorOpen, setLinkEditorOpen] = useState(false);
	const [linkDraft, setLinkDraft] = useState("");
	const [linkError, setLinkError] = useState(false);
	const [activeTool, setActiveTool] = useState(0);
	const toolRefs = useRef<Array<HTMLButtonElement | null>>([]);

	const editor = useEditor(
		{
			immediatelyRender: false,
			content: value,
			contentType: "markdown",
			editable: !disabled,
			extensions: [
				StarterKit.configure({
					code: false,
					codeBlock: false,
					heading: false,
					horizontalRule: false,
					underline: false,
					link: {
						autolink: false,
						openOnClick: false,
						enableClickSelection: true,
					},
				}),
				Markdown.configure({ markedOptions: { gfm: true, breaks: true } }),
				Placeholder.configure({ placeholder }),
				CharacterCount.configure({ limit: maxLength, autoTrim: false }),
			],
			editorProps: {
				attributes: {
					id,
					class: `${contentStyles.content} ${styles.contentEditable}`,
					role: "textbox",
					"aria-label": ariaLabel,
					"aria-multiline": "true",
					"aria-describedby": `${id}-formatted-text-hint`,
					enterkeyhint: "enter",
				},
			},
			onUpdate: ({ editor: currentEditor }) => onChange(currentEditor.getMarkdown()),
		},
		[id, maxLength, placeholder],
	);

	useEffect(() => {
		editor?.setEditable(!disabled, false);
		if (disabled) {
			setLinkEditorOpen(false);
			setLinkError(false);
		}
	}, [disabled, editor]);

	useEffect(() => {
		if (!editor || editor.getMarkdown() === value) return;
		editor.commands.setContent(value, { contentType: "markdown", emitUpdate: false });
	}, [editor, value]);

	const viewState =
		useEditorState({
			editor,
			selector: ({ editor: currentEditor }): EditorViewState =>
				currentEditor
					? {
							characters: currentEditor.storage.characterCount.characters(),
							bold: currentEditor.isActive("bold"),
							italic: currentEditor.isActive("italic"),
							strike: currentEditor.isActive("strike"),
							link: currentEditor.isActive("link"),
							bulletList: currentEditor.isActive("bulletList"),
							orderedList: currentEditor.isActive("orderedList"),
							blockquote: currentEditor.isActive("blockquote"),
						}
					: EMPTY_VIEW_STATE,
		}) ?? EMPTY_VIEW_STATE;

	const tools = [
		{
			key: "bold",
			label: t("common.formattedText.bold"),
			active: viewState.bold,
			icon: <BoldIcon size={15} aria-hidden="true" />,
			run: () => editor?.chain().focus().toggleBold().run(),
		},
		{
			key: "italic",
			label: t("common.formattedText.italic"),
			active: viewState.italic,
			icon: <ItalicIcon size={15} aria-hidden="true" />,
			run: () => editor?.chain().focus().toggleItalic().run(),
		},
		{
			key: "strike",
			label: t("common.formattedText.strikethrough"),
			active: viewState.strike,
			icon: <Strikethrough size={15} aria-hidden="true" />,
			run: () => editor?.chain().focus().toggleStrike().run(),
		},
		{
			key: "link",
			label: t("common.formattedText.link"),
			active: viewState.link,
			icon: <Link2 size={15} aria-hidden="true" />,
			run: () => openLinkEditor(),
		},
		{
			key: "bullet-list",
			label: t("common.formattedText.bulletList"),
			active: viewState.bulletList,
			icon: <List size={15} aria-hidden="true" />,
			run: () => editor?.chain().focus().toggleBulletList().run(),
		},
		{
			key: "ordered-list",
			label: t("common.formattedText.orderedList"),
			active: viewState.orderedList,
			icon: <ListOrdered size={15} aria-hidden="true" />,
			run: () => editor?.chain().focus().toggleOrderedList().run(),
		},
		{
			key: "quote",
			label: t("common.formattedText.quote"),
			active: viewState.blockquote,
			icon: <Quote size={15} aria-hidden="true" />,
			run: () => editor?.chain().focus().toggleBlockquote().run(),
		},
	];

	const moveToolbarFocus = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
		let target: number | null = null;
		if (event.key === "ArrowRight") target = (index + 1) % tools.length;
		if (event.key === "ArrowLeft") target = (index - 1 + tools.length) % tools.length;
		if (event.key === "Home") target = 0;
		if (event.key === "End") target = tools.length - 1;
		if (target === null) return;
		event.preventDefault();
		setActiveTool(target);
		toolRefs.current[target]?.focus();
	};

	const closeLinkEditor = () => {
		setLinkEditorOpen(false);
		setLinkError(false);
		editor?.chain().focus().run();
	};

	const openLinkEditor = () => {
		if (!editor || disabled) return;
		const currentHref = String(editor.getAttributes("link").href ?? "");
		setLinkDraft(currentHref || "https://");
		setLinkError(false);
		setLinkEditorOpen(true);
		requestAnimationFrame(() => document.getElementById(linkInputId)?.focus());
	};

	const applyLink = () => {
		if (!editor) return;
		const href = normalizeFormattedTextLink(linkDraft);
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

	const toolbar = (
		<div
			className={styles.toolbar}
			role="toolbar"
			aria-label={t("common.formattedText.toolbar")}
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
					disabled={disabled}
					onFocus={() => setActiveTool(index)}
					onKeyDown={(event) => moveToolbarFocus(event, index)}
					onClick={tool.run}
				>
					{tool.icon}
				</button>
			))}
		</div>
	);

	const linkEditor =
		linkEditorOpen && !disabled ? (
			<fieldset className={styles.linkEditor}>
				<legend>{t("common.formattedText.linkAddress")}</legend>
				<div className={styles.linkRow}>
					<input
						id={linkInputId}
						type="url"
						inputMode="url"
						enterKeyHint="done"
						autoCapitalize="none"
						autoCorrect="off"
						spellCheck={false}
						aria-label={t("common.formattedText.linkAddress")}
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
						aria-label={t("common.formattedText.applyLink")}
						title={t("common.formattedText.applyLink")}
						onClick={applyLink}
					>
						<Check size={15} aria-hidden="true" />
					</button>
					{viewState.link && (
						<button
							type="button"
							aria-label={t("common.formattedText.removeLink")}
							title={t("common.formattedText.removeLink")}
							onClick={removeLink}
						>
							<Unlink size={15} aria-hidden="true" />
						</button>
					)}
					<button
						type="button"
						aria-label={t("common.cancel")}
						title={t("common.cancel")}
						onClick={closeLinkEditor}
					>
						<X size={15} aria-hidden="true" />
					</button>
				</div>
				{linkError && (
					<span className={styles.linkError} role="alert">
						{t("common.formattedText.invalidLink")}
					</span>
				)}
			</fieldset>
		) : null;

	if (!editor) {
		return <div className={styles.editorPlaceholder} aria-hidden="true" />;
	}
	const characterCount = editor.storage.characterCount.characters();

	return (
		<div
			className={styles.editor}
			data-disabled={disabled ? "true" : undefined}
			data-ui="formatted-text-editor"
		>
			<div className={styles.fixedMenu}>
				{toolbar}
				{linkEditor}
			</div>
			<EditorContent editor={editor} className={styles.surface} />

			<div id={`${id}-formatted-text-hint`} className={styles.footer}>
				<span>{t("common.formattedText.formatHint")}</span>
				<span aria-live="polite">
					{t("common.formattedText.characterCount", {
						count: characterCount,
						max: maxLength,
					})}
				</span>
			</div>
		</div>
	);
}
