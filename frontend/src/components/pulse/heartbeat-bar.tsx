/**
 * 40-beat visualization bar — each beat colored by status.
 */
import type { FC } from "react";
import type { PulseHeartbeat } from "../../types/pulse.ts";
import styles from "./heartbeat-bar.module.css";

interface HeartbeatBarProps {
	heartbeats: PulseHeartbeat[];
}

const MAX_BEATS = 40;

const STATUS_CLASS: Record<number, string> = {
	0: "down",
	1: "up",
	2: "pending",
	3: "maintenance",
};

export const HeartbeatBar: FC<HeartbeatBarProps> = ({ heartbeats }) => {
	const beats = heartbeats.slice(-MAX_BEATS);
	const empty = MAX_BEATS - beats.length;

	return (
		<div className={styles.bar}>
			{Array.from({ length: empty }, (_, i) => (
				<div key={`e-${i}`} className={`${styles.beat} ${styles.empty}`} />
			))}
			{beats.map((b, i) => (
				<div
					key={`b-${i}`}
					className={`${styles.beat} ${styles[STATUS_CLASS[b.status] ?? "empty"]}`}
				/>
			))}
		</div>
	);
};
