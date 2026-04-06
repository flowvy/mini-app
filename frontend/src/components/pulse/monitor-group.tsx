/**
 * Named group of monitors — header + card body with rows.
 */
import type { FC } from "react";
import type { PulseGroup as PulseGroupType } from "../../types/pulse.ts";
import styles from "./monitor-group.module.css";
import { MonitorRow } from "./monitor-row.tsx";

interface MonitorGroupProps {
	group: PulseGroupType;
}

export const MonitorGroup: FC<MonitorGroupProps> = ({ group }) => {
	return (
		<div className={styles.group}>
			<div className={styles.header}>
				<span className={styles.name}>{group.name}</span>
			</div>
			<div className={styles.body}>
				{group.monitors.map((m) => (
					<MonitorRow key={m.id} monitor={m} />
				))}
			</div>
		</div>
	);
};
