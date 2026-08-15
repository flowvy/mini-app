import type { FC } from "react";
import styles from "./inline-feedback.module.css";

interface InlineFeedbackProps {
	children: string;
	id?: string;
	tone?: "error" | "success" | "warning";
}

export const InlineFeedback: FC<InlineFeedbackProps> = ({ children, id, tone = "error" }) => (
	<p
		id={id}
		className={`${styles.message} ${styles[tone]}`}
		role={tone === "error" ? "alert" : tone === "success" ? "status" : "note"}
	>
		{children}
	</p>
);
