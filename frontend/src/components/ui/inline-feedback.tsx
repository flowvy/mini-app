import type { FC } from "react";
import styles from "./inline-feedback.module.css";

interface InlineFeedbackProps {
	children: string;
	tone?: "error" | "success";
}

export const InlineFeedback: FC<InlineFeedbackProps> = ({ children, tone = "error" }) => (
	<p className={`${styles.message} ${styles[tone]}`} role={tone === "error" ? "alert" : "status"}>
		{children}
	</p>
);
