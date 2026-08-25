import { describe, expect, it } from "vitest";
import { normalizeTelegramTextLink, serializeTelegramHtml } from "../../src/lib/telegram-html.ts";

describe("Telegram HTML editor contract", () => {
	it("serializes visual marks to Telegram's allow-listed HTML subset", () => {
		expect(
			serializeTelegramHtml({
				type: "doc",
				content: [
					{
						type: "paragraph",
						content: [
							{ type: "text", text: "Hello", marks: [{ type: "italic" }] },
							{ type: "text", text: " " },
							{ type: "text", text: "FVY-123", marks: [{ type: "code" }] },
						],
					},
					{
						type: "blockquote",
						content: [{ type: "paragraph", content: [{ type: "text", text: "Read me" }] }],
					},
				],
			}),
		).toBe("<i>Hello</i> <code>FVY-123</code>\n<blockquote>Read me</blockquote>");
	});

	it("preserves custom emoji data and escapes authored text", () => {
		expect(
			serializeTelegramHtml({
				type: "doc",
				content: [
					{
						type: "paragraph",
						content: [
							{ type: "text", text: "A < B & " },
							{
								type: "telegramEmoji",
								attrs: { emojiId: "5368324170671202286", fallback: "👍" },
							},
						],
					},
				],
			}),
		).toBe('A &lt; B &amp; <tg-emoji emoji-id="5368324170671202286">👍</tg-emoji>');
	});

	it("allows only Telegram-safe link protocols", () => {
		expect(normalizeTelegramTextLink("example.com/invite")).toBe("https://example.com/invite");
		expect(normalizeTelegramTextLink("tg://user?id=42")).toBe("tg://user?id=42");
		expect(normalizeTelegramTextLink("javascript:alert(1)")).toBeNull();
	});

	it("preserves expandable quotes and preformatted blocks accepted by the backend", () => {
		expect(
			serializeTelegramHtml({
				type: "doc",
				content: [
					{
						type: "blockquote",
						attrs: { expandable: true },
						content: [{ type: "paragraph", content: [{ type: "text", text: "Details" }] }],
					},
					{ type: "codeBlock", content: [{ type: "text", text: "FVY-123" }] },
				],
			}),
		).toBe("<blockquote expandable>Details</blockquote>\n<pre>FVY-123</pre>");
	});
});
