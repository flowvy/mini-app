import { type FC, useEffect, useRef } from "react";
import { hapticNotification } from "../../lib/haptics.ts";
import styles from "./inline-feedback.module.css";

interface InlineFeedbackProps {
	children: string;
	id?: string;
	tone?: "error" | "success" | "warning" | "info";
	attention?: "passive" | "action";
}

export const InlineFeedback: FC<InlineFeedbackProps> = ({
	children,
	id,
	tone = "error",
	attention = "passive",
}) => {
	const messageRef = useRef<HTMLParagraphElement>(null);
	const actionAnnouncedRef = useRef(false);

	useEffect(() => {
		if (attention !== "action" || actionAnnouncedRef.current) return;
		actionAnnouncedRef.current = true;
		messageRef.current?.focus();
		hapticNotification("error");
	}, [attention]);

	return (
		<p
			ref={messageRef}
			id={id}
			className={`${styles.message} ${styles[tone]}`}
			data-attention={attention}
			role={tone === "error" ? "alert" : tone === "warning" ? "note" : "status"}
			tabIndex={attention === "action" ? -1 : undefined}
		>
			{children}
		</p>
	);
};
