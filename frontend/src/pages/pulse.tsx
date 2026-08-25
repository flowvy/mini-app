import type { FC } from "react";
import { useTranslation } from "react-i18next";
import { MonitorGroup } from "../components/pulse/monitor-group.tsx";
import { StatusBanner } from "../components/pulse/status-banner.tsx";
import { ErrorState } from "../components/ui/error-state.tsx";
import { FormSection, FormSectionCard } from "../components/ui/form-section.tsx";
import { PageLoading } from "../components/ui/page-loading.tsx";
import { usePulse } from "../hooks/use-pulse.ts";
import styles from "./pulse.module.css";

export const Pulse: FC = () => {
	const { pulse, isPending, error, refetch } = usePulse();
	const { t, i18n } = useTranslation();

	if (isPending) {
		return <PageLoading />;
	}

	if (error || !pulse) {
		return <ErrorState onAction={refetch} />;
	}

	return (
		<div className={styles.page}>
			<StatusBanner status={pulse.overallStatus} />

			<div className={styles.groups}>
				{pulse.groups.map((g) => (
					<MonitorGroup key={g.name} group={g} />
				))}
			</div>

			<FormSection title={t("pulse.incidents.title")}>
				<FormSectionCard>
					{pulse.incidents.length === 0 ? (
						<div className={styles.incidentsEmpty}>
							<span className={styles.incidentsEmptyText}>{t("pulse.noIncidents")}</span>
						</div>
					) : (
						<div className={styles.incidents}>
							{pulse.incidents.map((incident) => (
								<article
									key={`${incident.title}-${incident.createdAt}`}
									className={styles.incident}
								>
									<strong>{incident.title}</strong>
									<time dateTime={incident.createdAt}>
										{new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" }).format(
											new Date(incident.createdAt),
										)}
									</time>
								</article>
							))}
						</div>
					)}
				</FormSectionCard>
			</FormSection>
		</div>
	);
};
