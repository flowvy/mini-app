import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FormattedText } from "../../src/components/content/formatted-text.tsx";

describe("formatted text renderer", () => {
	it("renders the shared CommonMark subset semantically", () => {
		const markup = renderToStaticMarkup(
			<FormattedText>{"**Thank you**\n\n- Fast support\n- More traffic"}</FormattedText>,
		);

		expect(markup).toContain("<strong>Thank you</strong>");
		expect(markup).toContain("<ul>");
		expect(markup).toContain("<li>Fast support</li>");
	});

	it("does not execute raw HTML or unsafe links", () => {
		const markup = renderToStaticMarkup(
			<FormattedText>{"<script>alert(1)</script>\n\n[unsafe](javascript:alert(1))"}</FormattedText>,
		);

		expect(markup).not.toContain("<script");
		expect(markup).not.toContain("javascript:");
		expect(markup).toContain("unsafe");
	});
});
