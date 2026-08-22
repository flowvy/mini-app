import { ChevronDown } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSaveAccessProfile } from "../../hooks/use-registration-admin.ts";
import { getLocalizedError } from "../../lib/error-copy.ts";
import type {
	AccessProfile,
	AccessProfileInput,
	TrafficStrategy,
	ValidityMode,
} from "../../types/registration.ts";
import {
	PROVIDER_USER_STATUSES,
	type ProviderUserStatus,
	isProviderUserStatus,
} from "../../types/user-status.ts";
import { EditorDialog } from "../ui/editor-dialog.tsx";
import {
	FormField,
	FormFieldInput,
	FormFieldSelect,
	FormFieldTextarea,
	FormInlineDate,
	FormInlineField,
} from "../ui/form-section.tsx";
import { InlineFeedback } from "../ui/inline-feedback.tsx";
import { SegmentedControl } from "../ui/segmented-control.tsx";
import styles from "./access-profile-editor.module.css";

const GB = 1024 ** 3;
const STATUS_OPTION_KEY: Record<ProviderUserStatus, string> = {
	ACTIVE: "access.statusOptions.active",
	DISABLED: "access.statusOptions.disabled",
	LIMITED: "access.statusOptions.limited",
	EXPIRED: "access.statusOptions.expired",
};

const EMPTY_PROFILE: AccessProfileInput = {
	name: "",
	description: null,
	validityMode: "duration",
	validityDays: 30,
	fixedExpireAt: null,
	trafficLimitBytes: 0,
	trafficLimitStrategy: "NO_RESET",
	hwidDeviceLimit: null,
	tag: null,
	status: "ACTIVE",
	internalSquadUuids: [],
	externalSquadUuid: null,
};

function dateValue(iso: string | null): string {
	if (!iso) return "";
	const date = new Date(iso);
	const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
	return shifted.toISOString().slice(0, 10);
}

function endOfLocalDay(value: string): string | null {
	const parts = value.split("-").map(Number);
	if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) return null;
	const [year, month, day] = parts;
	if (year === undefined || month === undefined || day === undefined) return null;
	return new Date(year, month - 1, day, 23, 59, 59, 999).toISOString();
}

function defaultFixedExpiry(): string {
	const date = new Date(Date.now() + 30 * 86_400_000);
	date.setHours(23, 59, 59, 999);
	return date.toISOString();
}

function formatDateValue(value: string, locale: string): string {
	const [year, month, day] = value.split("-").map(Number);
	if (!year || !month || !day) return value;
	return new Intl.DateTimeFormat(locale, {
		day: "numeric",
		month: "short",
		year: "numeric",
		timeZone: "UTC",
	}).format(new Date(Date.UTC(year, month - 1, day)));
}

interface AccessProfileEditorProps {
	profile: AccessProfile | null;
	isRegistrationDefault: boolean;
	internalSquads: Array<{ uuid: string; name: string }>;
	externalSquads: Array<{ uuid: string; name: string }>;
	tags: string[];
	optionsState: "ready" | "error";
	returnFocusTo: HTMLElement | null;
	onClose: () => void;
}

export function AccessProfileEditor({
	profile,
	isRegistrationDefault,
	internalSquads,
	externalSquads,
	tags,
	optionsState,
	returnFocusTo,
	onClose,
}: AccessProfileEditorProps) {
	const { t } = useTranslation();
	const [draft, setDraft] = useState<AccessProfileInput>(() =>
		profile
			? {
					name: profile.name,
					description: profile.description,
					validityMode: profile.validityMode,
					validityDays: profile.validityDays,
					fixedExpireAt: profile.fixedExpireAt,
					trafficLimitBytes: profile.trafficLimitBytes,
					trafficLimitStrategy: profile.trafficLimitStrategy,
					hwidDeviceLimit: profile.hwidDeviceLimit,
					tag: profile.tag,
					status: profile.status,
					internalSquadUuids: profile.internalSquadUuids,
					externalSquadUuid: profile.externalSquadUuid,
				}
			: EMPTY_PROFILE,
	);
	const [trafficGb, setTrafficGb] = useState(() =>
		profile?.trafficLimitBytes ? String(profile.trafficLimitBytes / GB) : "",
	);
	const [devices, setDevices] = useState(() =>
		profile?.hwidDeviceLimit == null ? "" : String(profile.hwidDeviceLimit),
	);
	const save = useSaveAccessProfile();
	const fixedDate = dateValue(draft.fixedExpireAt);
	const tagIsUnchanged = Boolean(profile?.tag && profile.tag === draft.tag);
	const tagIsValid = draft.tag === null || tags.includes(draft.tag) || tagIsUnchanged;
	const trafficValue = trafficGb.trim() ? Number(trafficGb) : 0;
	const deviceValue = devices.trim() ? Number(devices) : null;
	const trafficIsValid = Number.isFinite(trafficValue) && trafficValue >= 0;
	const devicesAreValid =
		deviceValue === null ||
		(Number.isInteger(deviceValue) && deviceValue >= 0 && deviceValue <= 1_000);
	const automationConflictsWithRegistration =
		isRegistrationDefault && draft.validityMode === "automation";
	const valid =
		draft.name.trim().length > 0 &&
		draft.name.trim().length <= 100 &&
		(draft.validityMode !== "duration" ||
			((draft.validityDays ?? 0) > 0 && (draft.validityDays ?? 0) <= 3_650)) &&
		(draft.validityMode !== "fixed" || Boolean(draft.fixedExpireAt)) &&
		!automationConflictsWithRegistration &&
		tagIsValid &&
		trafficIsValid &&
		devicesAreValid;

	const submit = (event: FormEvent) => {
		event.preventDefault();
		if (!valid) return;
		save.mutate(
			{
				id: profile?.id,
				input: {
					...draft,
					name: draft.name.trim(),
					description: draft.description?.trim() || null,
					trafficLimitBytes: trafficValue > 0 ? Math.round(trafficValue * GB) : 0,
					hwidDeviceLimit: deviceValue,
				},
			},
			{ onSuccess: onClose },
		);
	};

	return (
		<EditorDialog
			eyebrow={t("access.profile")}
			title={profile ? t("access.editProfile") : t("access.newProfile")}
			subtitle={profile?.name || t("access.profileEditorHint")}
			closeLabel={t("access.closeEditor")}
			busy={save.isPending}
			returnFocusTo={returnFocusTo}
			onClose={onClose}
			onSubmit={submit}
			telegramFooter={{
				primaryText: profile ? t("common.save") : t("access.createProfile"),
				primaryDisabled: !valid,
			}}
		>
			{save.isError && (
				<InlineFeedback attention="action">
					{getLocalizedError(save.error, "access.profileSaveError")}
				</InlineFeedback>
			)}

			{optionsState === "error" && (
				<InlineFeedback>{t("access.providerOptionsUnavailable")}</InlineFeedback>
			)}

			<section className={styles.editorSection} aria-labelledby="profile-details-title">
				<div className={styles.editorCard}>
					<h3 id="profile-details-title" className={styles.editorSectionTitle}>
						{t("access.profileDetails")}
					</h3>
					<div className={styles.fields}>
						<FormField label={t("access.name")} htmlFor="access-profile-name">
							<FormFieldInput
								id="access-profile-name"
								value={draft.name}
								enterKeyHint="next"
								onChange={(event) => setDraft({ ...draft, name: event.target.value })}
								placeholder={t("access.namePlaceholder")}
								autoComplete="off"
								maxLength={100}
							/>
						</FormField>

						<FormField label={t("access.validity")}>
							<SegmentedControl
								ariaLabel={t("access.validity")}
								options={[
									{ key: "duration", label: t("access.days") },
									{ key: "fixed", label: t("access.date") },
									{ key: "lifetime", label: t("access.lifetimeOption") },
									{ key: "automation", label: t("access.automationOption") },
								]}
								value={draft.validityMode}
								onChange={(value) => {
									const mode = value as ValidityMode;
									setDraft({
										...draft,
										validityMode: mode,
										validityDays: mode === "duration" ? (draft.validityDays ?? 30) : null,
										fixedExpireAt:
											mode === "fixed" ? (draft.fixedExpireAt ?? defaultFixedExpiry()) : null,
									});
								}}
							/>
						</FormField>

						<div className={styles.validityPanel}>
							{draft.validityMode === "duration" && (
								<FormField
									label={t("access.validityDays")}
									htmlFor="access-profile-days"
									hint={t("access.durationHint")}
								>
									<FormFieldInput
										id="access-profile-days"
										type="number"
										inputMode="numeric"
										enterKeyHint="next"
										min="1"
										max="3650"
										value={draft.validityDays ?? ""}
										onChange={(event) =>
											setDraft({
												...draft,
												validityDays: Number(event.target.value) || null,
											})
										}
									/>
								</FormField>
							)}
							{draft.validityMode === "fixed" && (
								<FormInlineField label={t("access.expireAt")} htmlFor="access-profile-expiry">
									<FormInlineDate
										id="access-profile-expiry"
										value={fixedDate}
										displayValue={formatDateValue(fixedDate, navigator.language)}
										min={dateValue(new Date().toISOString())}
										onChange={(event) =>
											setDraft({
												...draft,
												fixedExpireAt: event.target.value
													? endOfLocalDay(event.target.value)
													: null,
											})
										}
									/>
								</FormInlineField>
							)}
							{draft.validityMode === "lifetime" && (
								<p className={styles.validityNotice}>{t("access.lifetimeHint")}</p>
							)}
							{draft.validityMode === "automation" && (
								<>
									<p className={styles.validityNotice}>{t("access.automationHint")}</p>
									{automationConflictsWithRegistration && (
										<InlineFeedback tone="warning">
											{t("access.automationDefaultConflict")}
										</InlineFeedback>
									)}
								</>
							)}
						</div>

						<div className={styles.twoColumns}>
							<FormField label={t("access.trafficGb")} htmlFor="access-profile-traffic">
								<FormFieldInput
									id="access-profile-traffic"
									type="number"
									inputMode="decimal"
									enterKeyHint="next"
									min="0"
									step="0.1"
									value={trafficGb}
									placeholder={t("access.zero")}
									aria-invalid={!trafficIsValid}
									onChange={(event) => setTrafficGb(event.target.value)}
								/>
							</FormField>
							<FormField label={t("access.devices")} htmlFor="access-profile-devices">
								<FormFieldInput
									id="access-profile-devices"
									type="number"
									inputMode="numeric"
									enterKeyHint="done"
									min="0"
									max="1000"
									value={devices}
									placeholder={t("access.unlimited")}
									aria-invalid={!devicesAreValid}
									onChange={(event) => setDevices(event.target.value)}
								/>
							</FormField>
						</div>
					</div>
				</div>
			</section>

			<details className={styles.advanced}>
				<summary>
					{t("access.advanced")}
					<ChevronDown size={15} />
				</summary>
				<div className={styles.advancedFields}>
					<FormField label={t("access.status")} htmlFor="access-profile-status">
						<FormFieldSelect
							id="access-profile-status"
							value={draft.status}
							options={PROVIDER_USER_STATUSES.map((status) => ({
								value: status,
								label: t(STATUS_OPTION_KEY[status]),
							}))}
							onChange={(event) => {
								if (isProviderUserStatus(event.target.value)) {
									setDraft({ ...draft, status: event.target.value });
								}
							}}
						/>
					</FormField>
					<FormField label={t("access.reset")} htmlFor="access-profile-reset">
						<FormFieldSelect
							id="access-profile-reset"
							value={draft.trafficLimitStrategy}
							options={[
								{ value: "NO_RESET", label: t("access.noReset") },
								{ value: "DAY", label: t("access.daily") },
								{ value: "WEEK", label: t("access.weekly") },
								{ value: "MONTH", label: t("access.monthly") },
								{ value: "MONTH_ROLLING", label: t("access.rolling") },
							]}
							onChange={(event) =>
								setDraft({
									...draft,
									trafficLimitStrategy: event.target.value as TrafficStrategy,
								})
							}
						/>
					</FormField>
					<FormField
						label={t("access.tag")}
						htmlFor="access-profile-tag"
						hint={
							optionsState === "ready" && tags.length === 0
								? t("access.noTags")
								: t("access.tagHint")
						}
					>
						<FormFieldSelect
							id="access-profile-tag"
							value={draft.tag ?? ""}
							options={[
								{ value: "", label: t("access.none") },
								...(draft.tag && !tags.includes(draft.tag)
									? [{ value: draft.tag, label: draft.tag }]
									: []),
								...tags.map((tag) => ({ value: tag, label: tag })),
							]}
							onChange={(event) => setDraft({ ...draft, tag: event.target.value || null })}
							disabled={optionsState !== "ready"}
						/>
					</FormField>
					<FormField label={t("access.description")} htmlFor="access-profile-description">
						<FormFieldTextarea
							id="access-profile-description"
							rows={3}
							maxLength={500}
							value={draft.description ?? ""}
							onChange={(event) => setDraft({ ...draft, description: event.target.value })}
						/>
					</FormField>
					{internalSquads.length > 0 && (
						<fieldset className={styles.checks}>
							<legend>{t("access.internalSquads")}</legend>
							{internalSquads.map((squad) => (
								<label key={squad.uuid}>
									<input
										type="checkbox"
										checked={draft.internalSquadUuids.includes(squad.uuid)}
										onChange={(event) =>
											setDraft({
												...draft,
												internalSquadUuids: event.target.checked
													? [...draft.internalSquadUuids, squad.uuid]
													: draft.internalSquadUuids.filter((id) => id !== squad.uuid),
											})
										}
									/>
									<span>{squad.name}</span>
								</label>
							))}
						</fieldset>
					)}
					<FormField label={t("access.externalSquad")} htmlFor="access-profile-external">
						<FormFieldSelect
							id="access-profile-external"
							value={draft.externalSquadUuid ?? ""}
							options={[
								{ value: "", label: t("access.none") },
								...externalSquads.map((squad) => ({ value: squad.uuid, label: squad.name })),
							]}
							onChange={(event) =>
								setDraft({ ...draft, externalSquadUuid: event.target.value || null })
							}
							disabled={optionsState !== "ready"}
						/>
					</FormField>
				</div>
			</details>
		</EditorDialog>
	);
}
