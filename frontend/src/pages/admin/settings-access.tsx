import type { TFunction } from "i18next";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AccessProfileEditor } from "../../components/admin/access-profile-editor.tsx";
import { ActionBtn } from "../../components/ui/action-btn.tsx";
import { ConfirmDialog } from "../../components/ui/confirm-dialog.tsx";
import {
	FormInlineSelect,
	FormRow,
	FormRowSeparator,
	FormSectionCard,
	FormSectionFooter,
	FormSectionHeader,
} from "../../components/ui/form-section.tsx";
import { InlineFeedback } from "../../components/ui/inline-feedback.tsx";
import { LoadErrorState } from "../../components/ui/load-error-state.tsx";
import { PageLoading } from "../../components/ui/page-loading.tsx";
import { SegmentedControl } from "../../components/ui/segmented-control.tsx";
import {
	useDeactivateAccessProfile,
	useRegistrationAdmin,
	useUpdateRegistrationSettings,
} from "../../hooks/use-registration-admin.ts";
import type { AccessProfile } from "../../types/registration.ts";
import styles from "./settings-access.module.css";

const GB = 1024 ** 3;

function accessSummary(profile: AccessProfile, t: TFunction): string {
	const validity =
		profile.validityMode === "lifetime"
			? t("access.lifetime")
			: profile.validityMode === "duration"
				? t("access.daysSummary", { count: profile.validityDays })
				: new Date(profile.fixedExpireAt ?? "").toLocaleDateString();
	const traffic =
		profile.trafficLimitBytes === 0
			? t("access.trafficUnlimited")
			: t("access.trafficSummary", { count: Math.round(profile.trafficLimitBytes / GB) });
	return `${validity}, ${traffic}`;
}

export function AdminAccessSettings() {
	const { t } = useTranslation();
	const { settings, profiles, options } = useRegistrationAdmin();
	const updateSettings = useUpdateRegistrationSettings();
	const deactivate = useDeactivateAccessProfile();
	const [editingProfile, setEditingProfile] = useState<AccessProfile | null | undefined>(undefined);
	const [confirmation, setConfirmation] = useState<{ id: string; label: string } | null>(null);

	const activeProfiles = useMemo(
		() => (profiles.data ?? []).filter((profile) => profile.isActive),
		[profiles.data],
	);
	const defaultAccessOptions = useMemo(
		() => [
			{ value: "", label: t("access.localOnly") },
			...activeProfiles.map((profile) => ({ value: profile.id, label: profile.name })),
		],
		[activeProfiles, t],
	);
	const blockingError = settings.error || profiles.error;
	if (settings.isPending || profiles.isPending) return <PageLoading />;
	if (blockingError || !settings.data || !profiles.data) {
		return <LoadErrorState onRetry={() => Promise.all([settings.refetch(), profiles.refetch()])} />;
	}

	const changeMode = (value: string) => {
		if (value === settings.data.registrationMode) return;
		updateSettings.mutate({ registrationMode: value as "open" | "invite_only" });
	};
	const optionsState = options.isError ? "error" : "ready";
	return (
		<div className={styles.page}>
			<section className={styles.policySection}>
				<FormSectionHeader>{t("access.registration")}</FormSectionHeader>
				<FormSectionCard>
					<div className={styles.policyRow}>
						<div className={styles.policyCopy}>
							<span>{t("access.serviceMode")}</span>
							<small>{t("access.serviceModeHint")}</small>
						</div>
						<SegmentedControl
							options={[
								{ key: "open", label: t("access.open") },
								{ key: "invite_only", label: t("access.inviteOnly") },
							]}
							value={settings.data.registrationMode}
							onChange={changeMode}
							disabled={updateSettings.isPending}
						/>
					</div>
					<FormRowSeparator />
					<FormRow label={t("access.defaultAccess")}>
						<FormInlineSelect
							aria-label={t("access.defaultAccess")}
							value={settings.data.defaultAccessProfileId ?? ""}
							options={defaultAccessOptions}
							onChange={(event) =>
								updateSettings.mutate({ defaultAccessProfileId: event.target.value || null })
							}
							disabled={updateSettings.isPending}
						/>
					</FormRow>
				</FormSectionCard>
				<FormSectionFooter>{t("access.defaultAccessHint")}</FormSectionFooter>
				{updateSettings.isError && <InlineFeedback>{updateSettings.error.message}</InlineFeedback>}
			</section>

			{editingProfile !== undefined ? (
				<AccessProfileEditor
					key={editingProfile?.id ?? "new"}
					profile={editingProfile}
					internalSquads={options.data?.internalSquads ?? []}
					externalSquads={options.data?.externalSquads ?? []}
					tags={options.data?.tags ?? []}
					optionsState={optionsState}
					onClose={() => setEditingProfile(undefined)}
				/>
			) : (
				<section className={styles.profilesSection} aria-busy={options.isPending}>
					<div className={styles.sectionHeading}>
						<FormSectionHeader>{t("access.profiles")}</FormSectionHeader>
						<ActionBtn
							variant="ghost"
							onClick={() => setEditingProfile(null)}
							disabled={options.isPending}
							aria-label={t("access.add")}
						>
							<Plus size={14} /> {t("access.add")}
						</ActionBtn>
					</div>
					{options.isError && (
						<InlineFeedback>{t("access.providerOptionsUnavailable")}</InlineFeedback>
					)}
					<FormSectionCard>
						{activeProfiles.length === 0 ? (
							<p className={styles.empty}>{t("access.noProfiles")}</p>
						) : (
							activeProfiles.map((profile, index) => (
								<div key={profile.id}>
									{index > 0 && <FormRowSeparator />}
									<div className={styles.listRow}>
										<div>
											<strong>{profile.name}</strong>
											<small>{accessSummary(profile, t)}</small>
										</div>
										<div className={styles.rowActions}>
											<button
												type="button"
												className={styles.iconButton}
												onClick={() => setEditingProfile(profile)}
												aria-label={t("access.editProfile")}
												disabled={options.isPending}
											>
												<Pencil size={15} />
											</button>
											<button
												type="button"
												className={styles.iconButtonDanger}
												onClick={() => setConfirmation({ id: profile.id, label: profile.name })}
												aria-label={t("access.deactivate")}
											>
												<Trash2 size={15} />
											</button>
										</div>
									</div>
								</div>
							))
						)}
					</FormSectionCard>
				</section>
			)}
			{deactivate.isError && <InlineFeedback>{deactivate.error.message}</InlineFeedback>}

			<ConfirmDialog
				open={confirmation !== null}
				title={t("access.deactivateTitle")}
				confirmLabel={t("access.deactivate")}
				cancelLabel={t("access.cancel")}
				confirmVariant="danger"
				onCancel={() => setConfirmation(null)}
				onConfirm={() => {
					if (!confirmation) return;
					deactivate.mutate(confirmation.id);
					setConfirmation(null);
				}}
			>
				{t("access.deactivateBody", { name: confirmation?.label })}
			</ConfirmDialog>
		</div>
	);
}
