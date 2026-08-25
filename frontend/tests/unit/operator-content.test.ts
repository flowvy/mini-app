import { describe, expect, it } from "vitest";
import { selectInitialLocale, selectSupportedLocale } from "../../src/lib/locale.ts";
import {
	operatorFormattedText,
	operatorText,
	resolveOperatorContent,
} from "../../src/lib/operator-content.ts";

describe("operator content", () => {
	it("selects exact, base, and default supported locales", () => {
		expect(selectSupportedLocale(["ru-RU"], ["en", "ru"])).toBe("ru");
		expect(selectSupportedLocale(["de-DE"], ["en", "ru"])).toBe("en");
	});

	it("prefers Telegram language and falls back to browser language outside Telegram", () => {
		expect(selectInitialLocale("ru-RU", ["en-US"], ["en", "ru"])).toBe("ru");
		expect(selectInitialLocale(undefined, ["ru-RU", "en-US"], ["en", "ru"])).toBe("ru");
		expect(selectInitialLocale("de-DE", ["ru-RU"], ["en", "ru"])).toBe("en");
		expect(selectInitialLocale("de-DE", ["fr-FR"], ["en", "ru"])).toBe("en");
	});

	it("resolves only one locale and renders allow-listed placeholders", () => {
		const content = resolveOperatorContent(
			{
				en: { inviteTitle: "Invite friends" },
				ru: { inviteTitle: "Пригласить друзей" },
			},
			"ru-RU",
			"en",
		);

		expect(operatorText(content, "inviteTitle", "Fallback", { appName: "Acme" })).toBe(
			"Пригласить друзей",
		);
		expect(
			operatorText({ inviteShareText: "Join {{appName}} with {{code}}" }, "inviteShareText", "", {
				appName: "Acme",
				code: "FVY-123",
			}),
		).toBe("Join Acme with FVY-123");
	});

	it("escapes template values before rendering provider CommonMark", () => {
		expect(
			operatorFormattedText(
				{ inviteDescription: "**Join {{appName}}**" },
				"inviteDescription",
				"",
				{ appName: "Shop *Plus* [EU]" },
			),
		).toBe("**Join Shop \\*Plus\\* \\[EU\\]**");
	});
});
