import { AlertTriangle, Loader2 } from "lucide-react";
import type { FC } from "react";
import { useTranslation } from "react-i18next";
import { MonitorGroup } from "../components/pulse/monitor-group.tsx";
import { StatusBanner } from "../components/pulse/status-banner.tsx";
import { usePulse } from "../hooks/use-pulse.ts";
import styles from "./pulse.module.css";

export const Pulse: FC = () => {
	const { pulse, isPending, error, refetch } = usePulse();
	const { t } = useTranslation();

	if (isPending) {
		return (
			<div className={styles.page}>
				<div className={styles.loading}>
					<Loader2 size={24} className={styles.spinner} />
				</div>
			</div>
		);
	}

	if (error || !pulse) {
		return (
			<div className={styles.page}>
				<div className={styles.errorState}>
					<AlertTriangle size={32} />
					<span className={styles.errorTitle}>{t("pulse.error.title")}</span>
					<span className={styles.errorDesc}>{t("pulse.error.desc")}</span>
					<button type="button" className={styles.retryBtn} onClick={refetch}>
						{t("pulse.error.retry")}
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className={styles.page}>
			<p className={styles.hint}>{t("pulse.hint")}</p>

			<StatusBanner status={pulse.overallStatus} />

			<div className={styles.groups}>
				{pulse.groups.map((g) => (
					<MonitorGroup key={g.name} group={g} />
				))}
			</div>

			{pulse.incidents.length === 0 && (
				<div className={styles.incidentsEmpty}>
					<span className={styles.incidentsEmptyText}>{t("pulse.noIncidents")}</span>
				</div>
			)}
		</div>
	);
};
