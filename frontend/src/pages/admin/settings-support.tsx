import { Cloud, HardDrive, KeyRound, ShieldCheck, Timer } from "lucide-react";
import type { FC } from "react";
import { useTranslation } from "react-i18next";
import {
	SettingsDivider,
	SettingsFactRow,
	SettingsFields,
	SettingsInlineNotice,
	SettingsPanel,
	SettingsStatusRow,
} from "../../components/admin/settings-surface.tsx";
import { ActionBtn } from "../../components/ui/action-btn.tsx";
import { ErrorState } from "../../components/ui/error-state.tsx";
import { InlineFeedback } from "../../components/ui/inline-feedback.tsx";
import { PageLoading } from "../../components/ui/page-loading.tsx";
import { useAdminSupportStorage, useTestAdminSupportStorage } from "../../hooks/use-support.ts";
import supportStyles from "./settings-support.module.css";
import styles from "./settings.module.css";

function formatLimit(bytes: number): string {
	return `${Math.round(bytes / 1024 ** 2)} MB`;
}

export const AdminSupportSettings: FC = () => {
	const { t } = useTranslation();
	const storage = useAdminSupportStorage();
	const testStorage = useTestAdminSupportStorage();

	if (storage.isPending) return <PageLoading />;
	if (storage.error || !storage.data) {
		return <ErrorState onAction={() => void storage.refetch()} />;
	}

	const config = storage.data;
	const checkFailed = testStorage.data?.ok === false || Boolean(testStorage.error);
	return (
		<div
			className={styles.formPage}
			data-support-storage={config.configured ? "configured" : "missing"}
		>
			<p className={styles.screenIntro}>{t("settings.supportStorage.intro")}</p>

			<SettingsPanel title={t("settings.supportStorage.connectionSection")}>
				<SettingsStatusRow
					label={t("settings.supportStorage.status")}
					status={
						config.configured
							? t("settings.supportStorage.configured")
							: t("settings.supportStorage.notConfigured")
					}
					tone="default"
					description={
						config.configured
							? t("settings.supportStorage.privateDescription")
							: t("settings.supportStorage.missingDescription")
					}
					action={
						config.configured ? (
							<ActionBtn
								variant="action"
								size="sm"
								loading={testStorage.isPending}
								onClick={() => testStorage.mutate()}
							>
								{t("settings.supportStorage.test")}
							</ActionBtn>
						) : undefined
					}
				/>
				{(testStorage.data?.ok || checkFailed) && <SettingsDivider />}
				{testStorage.data?.ok && (
					<div className={styles.panelInset}>
						<InlineFeedback tone="info">{t("settings.supportStorage.testPassed")}</InlineFeedback>
					</div>
				)}
				{checkFailed && (
					<div className={styles.panelInset}>
						<InlineFeedback attention="action">
							{t("settings.supportStorage.testFailed")}
						</InlineFeedback>
					</div>
				)}
				{config.configured && (
					<>
						<SettingsDivider />
						<SettingsFactRow
							icon={<HardDrive size={16} aria-hidden="true" />}
							label={t("settings.supportStorage.bucket")}
							value={config.bucketName ?? "—"}
						/>
					</>
				)}
			</SettingsPanel>

			<SettingsPanel title={t("settings.supportStorage.setupSection")}>
				<SettingsFields>
					<SettingsInlineNotice icon={<ShieldCheck size={16} aria-hidden="true" />}>
						{t("settings.supportStorage.secretNotice")}
					</SettingsInlineNotice>
					<ol className={supportStyles.setupSteps}>
						<li>{t("settings.supportStorage.stepBucket")}</li>
						<li>{t("settings.supportStorage.stepToken")}</li>
						<li>{t("settings.supportStorage.stepCors")}</li>
						<li>{t("settings.supportStorage.stepRestart")}</li>
					</ol>
					<div
						className={supportStyles.variables}
						aria-label={t("settings.supportStorage.environment")}
					>
						<KeyRound size={16} aria-hidden="true" />
						<div>
							{config.requiredEnvironment.map((name) => (
								<code key={name}>{name}</code>
							))}
						</div>
					</div>
				</SettingsFields>
			</SettingsPanel>

			<SettingsPanel title={t("settings.supportStorage.policySection")}>
				<SettingsFactRow
					icon={<Cloud size={16} aria-hidden="true" />}
					label={t("settings.supportStorage.uploadLimit")}
					value={`${config.maxFiles} × ${formatLimit(config.maxFileBytes)}`}
				/>
				<SettingsDivider />
				<SettingsFactRow
					icon={<HardDrive size={16} aria-hidden="true" />}
					label={t("settings.supportStorage.messageLimit")}
					value={formatLimit(config.maxTotalBytes)}
				/>
				<SettingsDivider />
				<SettingsFactRow
					icon={<Timer size={16} aria-hidden="true" />}
					label={t("settings.supportStorage.retention")}
					value={t("settings.supportStorage.retentionValue", {
						attachments: config.attachmentRetentionDays,
						requests: config.requestRetentionDays,
					})}
				/>
			</SettingsPanel>
		</div>
	);
};
