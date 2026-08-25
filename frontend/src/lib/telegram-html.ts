import type { JSONContent } from "@tiptap/react";

const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:", "tg:"]);

function escapeText(value: string): string {
	return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeAttribute(value: string): string {
	return escapeText(value).replaceAll('"', "&quot;");
}

function serializeText(node: JSONContent): string {
	let result = escapeText(node.text ?? "");
	const marks = node.marks ?? [];
	const has = (type: string) => marks.some((mark) => mark.type === type);

	if (has("bold")) result = `<b>${result}</b>`;
	if (has("italic")) result = `<i>${result}</i>`;
	if (has("underline")) result = `<u>${result}</u>`;
	if (has("strike")) result = `<s>${result}</s>`;
	if (has("telegramSpoiler")) result = `<tg-spoiler>${result}</tg-spoiler>`;

	const link = marks.find((mark) => mark.type === "link");
	const href = typeof link?.attrs?.href === "string" ? link.attrs.href : null;
	if (href) result = `<a href="${escapeAttribute(href)}">${result}</a>`;

	if (has("code")) result = `<code>${result}</code>`;
	return result;
}

function serializeInline(nodes: JSONContent[] = []): string {
	return nodes
		.map((node) => {
			if (node.type === "text") return serializeText(node);
			if (node.type === "hardBreak") return "\n";
			if (node.type === "telegramEmoji") {
				const emojiId = typeof node.attrs?.emojiId === "string" ? node.attrs.emojiId : "";
				const fallback = typeof node.attrs?.fallback === "string" ? node.attrs.fallback : "";
				if (!/^\d{1,32}$/.test(emojiId) || !fallback) return escapeText(fallback);
				return `<tg-emoji emoji-id="${emojiId}">${escapeText(fallback)}</tg-emoji>`;
			}
			return serializeInline(node.content);
		})
		.join("");
}

function serializeBlocks(nodes: JSONContent[] = []): string {
	return nodes
		.map((node) => {
			if (node.type === "paragraph") return serializeInline(node.content);
			if (node.type === "blockquote") {
				const expandable = node.attrs?.expandable ? " expandable" : "";
				return `<blockquote${expandable}>${serializeBlocks(node.content)}</blockquote>`;
			}
			if (node.type === "codeBlock")
				return `<pre>${escapeText(node.content?.[0]?.text ?? "")}</pre>`;
			return serializeInline(node.content);
		})
		.join("\n");
}

/** Serialize the editor document to the HTML subset accepted by Telegram Bot API parse_mode=HTML. */
export function serializeTelegramHtml(document: JSONContent): string {
	return serializeBlocks(document.content).trim();
}

/**
 * Preserve source line breaks when Tiptap parses Telegram HTML. Raw line feeds in HTML text nodes
 * otherwise follow browser whitespace collapsing rules.
 */
export function prepareTelegramHtmlForEditor(source: string): string {
	const template = document.createElement("template");
	template.innerHTML = source.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
	const textNodes: Text[] = [];
	const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
	while (walker.nextNode()) textNodes.push(walker.currentNode as Text);

	for (const textNode of textNodes) {
		if (textNode.parentElement?.closest("pre, tg-emoji")) continue;
		const parts = textNode.data.split("\n");
		if (parts.length === 1) continue;
		const fragment = document.createDocumentFragment();
		parts.forEach((part, index) => {
			if (index > 0) fragment.append(document.createElement("br"));
			if (part) fragment.append(document.createTextNode(part));
		});
		textNode.replaceWith(fragment);
	}

	return template.innerHTML;
}

/** Normalize a Telegram text link while rejecting executable URL schemes. */
export function normalizeTelegramTextLink(value: string): string | null {
	const candidate = value.trim();
	if (!candidate) return null;
	const withProtocol = /^[a-z][a-z\d+.-]*:/i.test(candidate) ? candidate : `https://${candidate}`;
	try {
		const parsed = new URL(withProtocol);
		return SAFE_LINK_PROTOCOLS.has(parsed.protocol) && parsed.hostname ? parsed.href : null;
	} catch {
		return null;
	}
}
