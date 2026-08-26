import type { TFunction } from "i18next";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AccessProfileEditor } from "../../components/admin/access-profile-editor.tsx";
import {
	SettingsActionRow,
	SettingsDivider,
	SettingsFields,
	SettingsPanel,
} from "../../components/admin/settings-surface.tsx";
import { ActionBtn } from "../../components/ui/action-btn.tsx";
import { ConfirmDialog } from "../../components/ui/confirm-dialog.tsx";
import { ErrorState } from "../../components/ui/error-state.tsx";
import { FormField, FormFieldSelect } from "../../components/ui/form-section.tsx";
import { InlineFeedback } from "../../components/ui/inline-feedback.tsx";
import { PageLoading } from "../../components/ui/page-loading.tsx";
import { SegmentedControl } from "../../components/ui/segmented-control.tsx";
import {
	useDeactivateAccessProfile,
	useRegistrationAdmin,
	useUpdateRegistrationSettings,
} from "../../hooks/use-registration-admin.ts";
import { getLocalizedError } from "../../lib/error-copy.ts";
import type { AccessProfile } from "../../types/registration.ts";
import ss from "./settings.module.css";
import styles from "./settings-access.module.css";

const GB = 1024 ** 3;

function accessSummary(profile: AccessProfile, t: TFunction): string {
	const validity =
		profile.validityMode === "automation"
			? t("access.automationSummary")
			: profile.validityMode === "lifetime"
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
	const editorTriggerRef = useRef<HTMLButtonElement | null>(null);
	const [editingProfile, setEditingProfile] = useState<AccessProfile | null | undefined>(undefined);
	const [confirmation, setConfirmation] = useState<{ id: string; label: string } | null>(null);

	const activeProfiles = useMemo(
		() => (profiles.data ?? []).filter((profile) => profile.isActive),
		[profiles.data],
	);
	const defaultAccessOptions = useMemo(
		() => [
			{ value: "", label: t("access.localOnly") },
			...activeProfiles
				.filter((profile) => profile.validityMode !== "automation")
				.map((profile) => ({ value: profile.id, label: profile.name })),
		],
		[activeProfiles, t],
	);
	const blockingError = settings.error || profiles.error;
	if (settings.isPending || profiles.isPending) return <PageLoading />;
	if (blockingError || !settings.data || !profiles.data) {
		return <ErrorState onAction={() => Promise.all([settings.refetch(), profiles.refetch()])} />;
	}

	const changeMode = (value: string) => {
		if (value === settings.data.registrationMode) return;
		updateSettings.mutate({ registrationMode: value as "open" | "invite_only" });
	};
	const optionsState = options.isError ? "error" : "ready";
	const openEditor = (profile: AccessProfile | null, trigger: HTMLButtonElement) => {
		editorTriggerRef.current = trigger;
		setEditingProfile(profile);
	};
	return (
		<div className={ss.formPage}>
			<SettingsPanel title={t("access.registration")}>
				<SettingsFields>
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
							ariaLabel={t("access.serviceMode")}
							disabled={updateSettings.isPending}
						/>
					</div>
					<FormField
						label={t("access.defaultAccess")}
						htmlFor="default-access-profile"
						hint={t("access.defaultAccessHint")}
					>
						<FormFieldSelect
							id="default-access-profile"
							aria-label={t("access.defaultAccess")}
							value={settings.data.defaultAccessProfileId ?? ""}
							options={defaultAccessOptions}
							onChange={(event) =>
								updateSettings.mutate({ defaultAccessProfileId: event.target.value || null })
							}
							disabled={updateSettings.isPending}
						/>
					</FormField>
				</SettingsFields>
			</SettingsPanel>
			{updateSettings.isError && (
				<InlineFeedback attention="action">
					{getLocalizedError(updateSettings.error, "access.settingsSaveError")}
				</InlineFeedback>
			)}

			<SettingsPanel title={t("access.profiles")}>
				{activeProfiles.length === 0 ? (
					<div className={styles.empty}>
						<strong>{t("access.noProfiles")}</strong>
						<p>{t("access.noProfilesHint")}</p>
						<ActionBtn
							variant="confirm"
							size="md"
							onClick={(event) => openEditor(null, event.currentTarget)}
							disabled={options.isPending}
						>
							<Plus size={14} /> {t("access.createProfile")}
						</ActionBtn>
					</div>
				) : (
					<>
						{activeProfiles.map((profile, index) => (
							<div key={profile.id}>
								{index > 0 && <SettingsDivider />}
								<div className={styles.listRow}>
									<div>
										<strong>{profile.name}</strong>
										<small>{accessSummary(profile, t)}</small>
									</div>
									<div className={styles.rowActions}>
										<button
											type="button"
											className={styles.iconButton}
											onClick={(event) => openEditor(profile, event.currentTarget)}
											aria-label={t("access.editProfile")}
											disabled={options.isPending}
										>
											<Pencil size={16} />
										</button>
										<button
											type="button"
											className={styles.iconButtonDanger}
											onClick={() => setConfirmation({ id: profile.id, label: profile.name })}
											aria-label={t("access.deactivate")}
										>
											<Trash2 size={16} />
										</button>
									</div>
								</div>
							</div>
						))}
						<SettingsDivider />
						<SettingsActionRow
							icon={<Plus size={14} aria-hidden="true" />}
							label={t("access.createProfile")}
							description={t("access.createProfileHint")}
							onClick={(event) => openEditor(null, event.currentTarget)}
							disabled={options.isPending}
						/>
					</>
				)}
			</SettingsPanel>
			{options.isError && editingProfile === undefined && (
				<InlineFeedback>{t("access.providerOptionsUnavailable")}</InlineFeedback>
			)}

			{editingProfile !== undefined && (
				<AccessProfileEditor
					key={editingProfile?.id ?? "new"}
					profile={editingProfile}
					isRegistrationDefault={editingProfile?.id === settings.data.defaultAccessProfileId}
					internalSquads={options.data?.internalSquads ?? []}
					externalSquads={options.data?.externalSquads ?? []}
					tags={options.data?.tags ?? []}
					optionsState={optionsState}
					returnFocusTo={editorTriggerRef.current}
					onClose={() => setEditingProfile(undefined)}
				/>
			)}
			{deactivate.isError && (
				<InlineFeedback attention="action">
					{getLocalizedError(deactivate.error, "access.deactivateError")}
				</InlineFeedback>
			)}

			<ConfirmDialog
				open={confirmation !== null}
				title={t("access.deactivateTitle")}
				confirmLabel={t("access.deactivate")}
				cancelLabel={t("access.cancel")}
				telegramNativeMessage={t("access.deactivateBody", { name: confirmation?.label })}
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
