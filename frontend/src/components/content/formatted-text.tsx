import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import styles from "./formatted-text.module.css";

const ALLOWED_ELEMENTS = [
	"p",
	"br",
	"strong",
	"em",
	"del",
	"a",
	"blockquote",
	"ul",
	"ol",
	"li",
	"code",
] as const;

interface FormattedTextProps {
	children: string;
	className?: string;
}

/** Safe renderer for the shared, deliberately small CommonMark content contract. */
export function FormattedText({ children, className }: FormattedTextProps) {
	return (
		<div className={`${styles.content} ${className ?? ""}`}>
			<ReactMarkdown
				remarkPlugins={[remarkGfm, remarkBreaks]}
				allowedElements={[...ALLOWED_ELEMENTS]}
				unwrapDisallowed
				skipHtml
				components={{
					a: ({ node: _node, ...props }) => (
						<a {...props} target="_blank" rel="noopener noreferrer" />
					),
				}}
			>
				{children}
			</ReactMarkdown>
		</div>
	);
}
