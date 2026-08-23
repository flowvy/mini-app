import type { LucideIcon } from "lucide-react";
import type { FC } from "react";
import styles from "./coming-soon.module.css";

interface ComingSoonProps {
	id: string;
	icon: LucideIcon;
	title: string;
	description: string;
}

export const ComingSoon: FC<ComingSoonProps> = ({ id, icon: Icon, title, description }) => (
	<div className={styles.page}>
		<section className={styles.card} aria-labelledby={`${id}-title`} data-ui="coming-soon">
			<Icon size={36} className={styles.icon} aria-hidden="true" />
			<div className={styles.copy}>
				<h1 id={`${id}-title`} className={styles.title}>
					{title}
				</h1>
				<p className={styles.description}>{description}</p>
			</div>
		</section>
	</div>
);
