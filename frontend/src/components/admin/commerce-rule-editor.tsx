import { Plus, Trash2 } from "lucide-react";
import { type FormEvent, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	useCommerceCatalog,
	useDeleteCommerceRule,
	usePreviewCommerceRule,
	useSaveCommerceRule,
} from "../../hooks/use-commerce-rules.ts";
import { ApiError } from "../../lib/api.ts";
import { getLocalizedError } from "../../lib/error-copy.ts";
import {
	formatMajorMoney,
	formatMinorMoney,
	majorToMinor,
	minorToMajorInput,
} from "../../lib/money.ts";
import type {
	CalculationType,
	CommerceCatalogSubscription,
	CommerceRule,
	CommerceRuleInput,
	CommerceType,
	GrantMode,
	PaymentMode,
	TributeSubscriptionPeriod,
} from "../../types/commerce.ts";
import type { AccessProfile } from "../../types/registration.ts";
import { ActionBtn } from "../ui/action-btn.tsx";
import { ConfirmDialog } from "../ui/confirm-dialog.tsx";
import { EditorDialog } from "../ui/editor-dialog.tsx";
import {
	FormField,
	FormFieldInput,
	FormFieldSelect,
	FormRow,
	FormRowSeparator,
} from "../ui/form-section.tsx";
import { InlineFeedback } from "../ui/inline-feedback.tsx";
import { SegmentedControl } from "../ui/segmented-control.tsx";
import styles from "./commerce-rule-editor.module.css";

interface BandDraft {
	key: number;
	from: string;
	unitAmount: string;
	unitDays: string;
}

interface RuleDraft {
	name: string;
	commerceType: CommerceType;
	paymentMode: PaymentMode;
	externalItemId: string;
	currency: string;
	calculationType: CalculationType;
	fixedDurationDays: string;
	bands: BandDraft[];
	accessProfileId: string;
	grantMode: GrantMode;
	priority: string;
	isEnabled: boolean;
}

let nextBandKey = 1;

function blankBand(): BandDraft {
	return { key: nextBandKey++, from: "", unitAmount: "", unitDays: "" };
}

function initialDraft(rule: CommerceRule | null, profiles: AccessProfile[]): RuleDraft {
	if (rule) {
		return {
			name: rule.name,
			commerceType: rule.commerceType,
			paymentMode: rule.paymentMode,
			externalItemId: rule.externalItemId ?? "",
			currency: rule.currency,
			calculationType:
				rule.commerceType === "subscription" ? "provider_expiry" : rule.calculationType,
			fixedDurationDays: rule.fixedDurationDays == null ? "" : String(rule.fixedDurationDays),
			bands: rule.amountBands.map((band) => ({
				key: nextBandKey++,
				from: minorToMajorInput(band.fromAmountMinor, rule.currency),
				unitAmount: minorToMajorInput(band.unitAmountMinor, rule.currency),
				unitDays: String(band.unitDays),
			})),
			accessProfileId: rule.accessProfileId,
			grantMode: rule.commerceType === "subscription" ? "replace" : rule.grantMode,
			priority: String(rule.priority),
			isEnabled: rule.isEnabled,
		};
	}
	return {
		name: "",
		commerceType: "donation",
		paymentMode: "any",
		externalItemId: "",
		currency: "RUB",
		calculationType: "volume",
		fixedDurationDays: "",
		bands: [blankBand()],
		accessProfileId: profiles.find((profile) => profile.isActive)?.id ?? "",
		grantMode: "extend",
		priority: "100",
		isEnabled: true,
	};
}

function positiveInteger(value: string, maximum: number): number | null {
	if (!/^\d+$/.test(value.trim())) return null;
	const parsed = Number(value);
	return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= maximum ? parsed : null;
}

function toInput(draft: RuleDraft, profiles: AccessProfile[]): CommerceRuleInput | null {
	const currency = draft.currency.trim().toUpperCase();
	const priority = positiveInteger(draft.priority, 10_000);
	if (
		!draft.name.trim() ||
		!/^[A-Z]{3}$/.test(currency) ||
		priority === null ||
		!profiles.some((profile) => profile.id === draft.accessProfileId && profile.isActive)
	) {
		return null;
	}
	const externalItemId = draft.externalItemId.trim() || null;
	if (draft.commerceType !== "donation" && externalItemId === null) return null;
	const calculationType =
		draft.commerceType === "subscription" ? "provider_expiry" : draft.calculationType;

	const fixedDurationDays =
		calculationType === "fixed" ? positiveInteger(draft.fixedDurationDays, 36_500) : null;
	if (calculationType === "fixed" && fixedDurationDays === null) return null;

	const amountBands = [];
	if (calculationType === "volume") {
		for (const band of draft.bands) {
			const fromAmountMinor = majorToMinor(band.from, currency);
			const unitAmountMinor = majorToMinor(band.unitAmount, currency);
			const unitDays = positiveInteger(band.unitDays, 36_500);
			if (
				fromAmountMinor === null ||
				fromAmountMinor < 1 ||
				unitAmountMinor === null ||
				unitAmountMinor < 1 ||
				unitDays === null
			) {
				return null;
			}
			amountBands.push({ fromAmountMinor, unitAmountMinor, unitDays });
		}
		if (amountBands.length === 0) return null;
		const thresholds = amountBands.map((band) => band.fromAmountMinor);
		if (new Set(thresholds).size !== thresholds.length) return null;
		amountBands.sort((left, right) => left.fromAmountMinor - right.fromAmountMinor);
	}

	return {
		provider: "tribute",
		name: draft.name.trim(),
		commerceType: draft.commerceType,
		paymentMode: draft.paymentMode,
		externalItemId: draft.commerceType === "donation" ? null : externalItemId,
		currency,
		calculationType,
		fixedDurationDays,
		amountBands,
		accessProfileId: draft.accessProfileId,
		grantMode: draft.commerceType === "subscription" ? "replace" : draft.grantMode,
		priority,
		isEnabled: draft.isEnabled,
	};
}

interface CommerceRuleEditorProps {
	rule: CommerceRule | null;
	profiles: AccessProfile[];
	returnFocusTo: HTMLElement | null;
	onClose: () => void;
}

export function CommerceRuleEditor({
	rule,
	profiles,
	returnFocusTo,
	onClose,
}: CommerceRuleEditorProps) {
	const { t } = useTranslation();
	const [draft, setDraft] = useState(() => initialDraft(rule, profiles));
	const [previewAmount, setPreviewAmount] = useState("");
	const [previewFingerprint, setPreviewFingerprint] = useState<string | null>(null);
	const [confirmDelete, setConfirmDelete] = useState(false);
	const deleteTriggerRef = useRef<HTMLButtonElement>(null);
	const save = useSaveCommerceRule();
	const catalog = useCommerceCatalog();
	const preview = usePreviewCommerceRule();
	const remove = useDeleteCommerceRule();
	const input = toInput(draft, profiles);
	const previewAmountMinor = majorToMinor(previewAmount, draft.currency);
	const currentFingerprint = JSON.stringify({ input, previewAmountMinor });
	const previewData = previewFingerprint === currentFingerprint ? preview.data : null;
	const { error: previewMutationFailure } = preview;
	const previewError = previewFingerprint === currentFingerprint ? previewMutationFailure : null;
	const busy = save.isPending || remove.isPending;
	const activeProfiles = profiles.filter((profile) => profile.isActive);
	const catalogItems =
		draft.commerceType === "subscription" ? (catalog.data?.subscriptions ?? []) : [];
	const selectedCatalogItem = catalogItems.find(
		(item) => item.externalItemId === draft.externalItemId,
	);
	const catalogOptions = (() => {
		if (draft.commerceType === "donation") return [];
		const placeholder = catalog.isPending
			? t("settings.tribute.rules.catalogLoading")
			: catalog.isError
				? t("settings.tribute.rules.catalogUnavailable")
				: t("settings.tribute.rules.selectSubscription");
		const options = [{ value: "", label: placeholder, disabled: true }];
		if (draft.externalItemId && !selectedCatalogItem) {
			options.push({
				value: draft.externalItemId,
				label: t("settings.tribute.rules.catalogCurrentItem", {
					id: draft.externalItemId,
				}),
				disabled: false,
			});
		}
		options.push(
			...(catalog.data?.subscriptions ?? []).map((subscription) => ({
				value: subscription.externalItemId,
				label: subscriptionLabel(subscription, t),
				disabled: false,
			})),
		);
		return options;
	})();

	const submit = (event: FormEvent) => {
		event.preventDefault();
		if (!input) return;
		save.mutate({ id: rule?.id, input }, { onSuccess: onClose });
	};

	const updateBand = (key: number, patch: Partial<BandDraft>) => {
		setDraft((current) => ({
			...current,
			bands: current.bands.map((band) => (band.key === key ? { ...band, ...patch } : band)),
		}));
	};

	const selectCatalogItem = (externalItemId: string) => {
		const item = catalogItems.find((candidate) => candidate.externalItemId === externalItemId);
		setDraft((current) => ({
			...current,
			externalItemId,
			currency: item?.currency ?? current.currency,
			name:
				item && (!current.name.trim() || current.name === selectedCatalogItem?.name)
					? item.name
					: current.name,
		}));
	};

	const previewErrorCopy = () => {
		if (!(previewError instanceof ApiError)) return t("settings.tribute.rules.previewError");
		if (previewError.status === 401) return t("settings.tribute.rules.previewSessionExpired");
		if (previewError.status === 403) return t("settings.tribute.rules.previewForbidden");
		if (previewError.status === 422) return t("settings.tribute.rules.previewInvalid");
		if (previewError.status === 404 || previewError.status >= 500) {
			return t("settings.tribute.rules.previewUnavailable");
		}
		return t("settings.tribute.rules.previewError");
	};

	return (
		<>
			<EditorDialog
				eyebrow={t("settings.tribute.rules.editorEyebrow")}
				title={
					rule ? t("settings.tribute.rules.editTitle") : t("settings.tribute.rules.createTitle")
				}
				subtitle={rule?.name || t("settings.tribute.rules.editorSubtitle")}
				closeLabel={t("settings.tribute.rules.closeEditor")}
				busy={busy}
				returnFocusTo={returnFocusTo}
				onClose={onClose}
				onSubmit={submit}
				footer={
					<>
						<ActionBtn variant="ghost" size="md" onClick={onClose} disabled={busy}>
							{t("access.cancel")}
						</ActionBtn>
						<ActionBtn
							type="submit"
							variant="confirm"
							size="md"
							disabled={!input}
							loading={save.isPending}
						>
							{rule ? t("common.save") : t("settings.tribute.rules.createAction")}
						</ActionBtn>
					</>
				}
			>
				<section className={styles.card} aria-labelledby="commerce-match-title">
					<h3 id="commerce-match-title" className={styles.cardTitle}>
						{t("settings.tribute.rules.matchSection")}
					</h3>
					<div className={styles.fields}>
						<FormField label={t("settings.tribute.rules.name")} htmlFor="commerce-rule-name">
							<FormFieldInput
								id="commerce-rule-name"
								value={draft.name}
								maxLength={100}
								autoComplete="off"
								placeholder={t("settings.tribute.rules.namePlaceholder")}
								onChange={(event) => setDraft({ ...draft, name: event.target.value })}
							/>
						</FormField>
						<FormField label={t("settings.tribute.rules.commerceType")}>
							<SegmentedControl
								ariaLabel={t("settings.tribute.rules.commerceType")}
								options={[
									{ key: "donation", label: t("settings.tribute.rules.donation") },
									{ key: "subscription", label: t("settings.tribute.rules.subscription") },
								]}
								value={draft.commerceType}
								onChange={(value) => {
									const commerceType = value as CommerceType;
									setDraft({
										...draft,
										commerceType,
										paymentMode: commerceType === "subscription" ? "recurring" : "any",
										externalItemId: commerceType === draft.commerceType ? draft.externalItemId : "",
										calculationType:
											commerceType === "subscription"
												? "provider_expiry"
												: draft.calculationType === "provider_expiry"
													? "volume"
													: draft.calculationType,
										grantMode: commerceType === "subscription" ? "replace" : draft.grantMode,
										name:
											draft.name === selectedCatalogItem?.name &&
											commerceType !== draft.commerceType
												? ""
												: draft.name,
									});
								}}
							/>
						</FormField>
						{draft.commerceType === "donation" ? (
							<FormField
								label={t("settings.tribute.rules.paymentMode")}
								htmlFor="commerce-payment-mode"
								hint={t("settings.tribute.rules.paymentModeHint")}
							>
								<FormFieldSelect
									id="commerce-payment-mode"
									value={draft.paymentMode}
									options={[
										{ value: "any", label: t("settings.tribute.rules.paymentAny") },
										{ value: "one_time", label: t("settings.tribute.rules.paymentOneTime") },
										{ value: "recurring", label: t("settings.tribute.rules.paymentRecurring") },
									]}
									onChange={(event) =>
										setDraft({ ...draft, paymentMode: event.target.value as PaymentMode })
									}
								/>
							</FormField>
						) : (
							<FormField
								label={t("settings.tribute.rules.providerItem")}
								htmlFor="commerce-provider-item"
								hint={t("settings.tribute.rules.providerItemHint")}
							>
								<FormFieldSelect
									id="commerce-provider-item"
									value={draft.externalItemId}
									options={catalogOptions}
									disabled={catalog.isPending || catalog.isError || catalogItems.length === 0}
									onChange={(event) => selectCatalogItem(event.target.value)}
								/>
								{catalog.isSuccess && catalogItems.length === 0 && (
									<span className={styles.fieldNotice}>
										{t("settings.tribute.rules.noSubscriptions")}
									</span>
								)}
							</FormField>
						)}
						{draft.commerceType !== "donation" && catalog.isError && (
							<div className={styles.catalogError}>
								<InlineFeedback>{t("settings.tribute.rules.catalogError")}</InlineFeedback>
								<ActionBtn variant="action" size="sm" onClick={() => void catalog.refetch()}>
									{t("common.retry")}
								</ActionBtn>
							</div>
						)}
						<div className={styles.twoColumns}>
							<FormField label={t("settings.tribute.rules.currency")} htmlFor="commerce-currency">
								<FormFieldInput
									id="commerce-currency"
									value={draft.currency}
									maxLength={3}
									autoCapitalize="characters"
									readOnly={draft.commerceType !== "donation" && Boolean(selectedCatalogItem)}
									onChange={(event) =>
										setDraft({ ...draft, currency: event.target.value.toUpperCase() })
									}
								/>
							</FormField>
							<FormField
								label={t("settings.tribute.rules.priority")}
								htmlFor="commerce-priority"
								hint={t("settings.tribute.rules.priorityHint")}
							>
								<FormFieldInput
									id="commerce-priority"
									type="number"
									inputMode="numeric"
									min="1"
									max="10000"
									value={draft.priority}
									onChange={(event) => setDraft({ ...draft, priority: event.target.value })}
								/>
							</FormField>
						</div>
					</div>
				</section>

				<section className={styles.card} aria-labelledby="commerce-access-title">
					<h3 id="commerce-access-title" className={styles.cardTitle}>
						{t("settings.tribute.rules.accessSection")}
					</h3>
					<div className={styles.fields}>
						{activeProfiles.length === 0 && (
							<InlineFeedback>{t("settings.tribute.rules.noActiveProfiles")}</InlineFeedback>
						)}
						<FormField
							label={t("settings.tribute.rules.accessProfile")}
							htmlFor="commerce-access-profile"
							hint={t(
								draft.commerceType === "subscription"
									? "settings.tribute.rules.subscriptionProfileHint"
									: "settings.tribute.rules.accessProfileHint",
							)}
						>
							<FormFieldSelect
								id="commerce-access-profile"
								value={draft.accessProfileId}
								options={[
									{ value: "", label: t("settings.tribute.rules.selectProfile") },
									...activeProfiles.map((profile) => ({ value: profile.id, label: profile.name })),
								]}
								disabled={activeProfiles.length === 0}
								onChange={(event) => setDraft({ ...draft, accessProfileId: event.target.value })}
							/>
						</FormField>
						{draft.commerceType === "subscription" ? (
							<div className={styles.providerExpiry}>
								<strong>{t("settings.tribute.rules.providerExpiryTitle")}</strong>
								<span>{t("settings.tribute.rules.providerExpiryHint")}</span>
							</div>
						) : (
							<>
								<FormField label={t("settings.tribute.rules.grantMode")}>
									<SegmentedControl
										ariaLabel={t("settings.tribute.rules.grantMode")}
										options={[
											{ key: "extend", label: t("settings.tribute.rules.extend") },
											{ key: "replace", label: t("settings.tribute.rules.replace") },
										]}
										value={draft.grantMode}
										onChange={(value) => setDraft({ ...draft, grantMode: value as GrantMode })}
									/>
								</FormField>
								<FormField label={t("settings.tribute.rules.calculation")}>
									<SegmentedControl
										ariaLabel={t("settings.tribute.rules.calculation")}
										options={[
											{ key: "fixed", label: t("settings.tribute.rules.fixed") },
											{ key: "volume", label: t("settings.tribute.rules.amountBands") },
										]}
										value={draft.calculationType}
										onChange={(value) =>
											setDraft({
												...draft,
												calculationType: value as CalculationType,
												bands: draft.bands.length ? draft.bands : [blankBand()],
											})
										}
									/>
								</FormField>
								{draft.calculationType === "fixed" ? (
									<FormField
										label={t("settings.tribute.rules.fixedDays")}
										htmlFor="commerce-fixed-days"
									>
										<FormFieldInput
											id="commerce-fixed-days"
											type="number"
											inputMode="numeric"
											min="1"
											max="36500"
											value={draft.fixedDurationDays}
											onChange={(event) =>
												setDraft({ ...draft, fixedDurationDays: event.target.value })
											}
										/>
									</FormField>
								) : (
									<div className={styles.bands}>
										<p className={styles.help}>{t("settings.tribute.rules.volumeHint")}</p>
										{draft.bands.map((band, index) => (
											<fieldset
												className={styles.band}
												key={band.key}
												aria-label={t("settings.tribute.rules.band", { count: index + 1 })}
											>
												<div className={styles.bandHeader}>
													<strong>{t("settings.tribute.rules.band", { count: index + 1 })}</strong>
													{draft.bands.length > 1 && (
														<ActionBtn
															variant="ghost"
															size="sm"
															className={styles.removeBand}
															aria-label={t("settings.tribute.rules.removeBandLabel", {
																count: index + 1,
															})}
															onClick={() =>
																setDraft({
																	...draft,
																	bands: draft.bands.filter((item) => item.key !== band.key),
																})
															}
														>
															<Trash2 size={15} aria-hidden="true" />
														</ActionBtn>
													)}
												</div>
												<div className={styles.bandRows}>
													<FormRow
														label={t("settings.tribute.rules.fromAmount")}
														htmlFor={`commerce-band-from-${band.key}`}
													>
														<div className={styles.bandControl}>
															<FormFieldInput
																id={`commerce-band-from-${band.key}`}
																className={styles.bandInput}
																inputMode="decimal"
																value={band.from}
																onChange={(event) =>
																	updateBand(band.key, { from: event.target.value })
																}
															/>
															<span className={styles.bandUnit}>{draft.currency}</span>
														</div>
													</FormRow>
													<FormRowSeparator />
													<FormRow
														label={t("settings.tribute.rules.everyAmount")}
														htmlFor={`commerce-band-unit-${band.key}`}
													>
														<div className={styles.bandControl}>
															<FormFieldInput
																id={`commerce-band-unit-${band.key}`}
																className={styles.bandInput}
																inputMode="decimal"
																value={band.unitAmount}
																onChange={(event) =>
																	updateBand(band.key, { unitAmount: event.target.value })
																}
															/>
															<span className={styles.bandUnit}>{draft.currency}</span>
														</div>
													</FormRow>
													<FormRowSeparator />
													<FormRow
														label={t("settings.tribute.rules.grantDays")}
														htmlFor={`commerce-band-days-${band.key}`}
													>
														<div className={styles.bandControl}>
															<FormFieldInput
																id={`commerce-band-days-${band.key}`}
																className={styles.bandInput}
																type="number"
																inputMode="numeric"
																min="1"
																max="36500"
																value={band.unitDays}
																onChange={(event) =>
																	updateBand(band.key, { unitDays: event.target.value })
																}
															/>
															<span className={styles.bandUnit}>
																{t("settings.tribute.rules.daysUnit")}
															</span>
														</div>
													</FormRow>
												</div>
											</fieldset>
										))}
										<ActionBtn
											variant="action"
											size="sm"
											className={styles.addBand}
											disabled={draft.bands.length >= 20}
											onClick={() => setDraft({ ...draft, bands: [...draft.bands, blankBand()] })}
										>
											<Plus size={13} /> {t("settings.tribute.rules.addBand")}
										</ActionBtn>
									</div>
								)}
							</>
						)}
					</div>
				</section>

				{draft.commerceType !== "subscription" && (
					<section className={styles.card} aria-labelledby="commerce-preview-title">
						<h3 id="commerce-preview-title" className={styles.cardTitle}>
							{t("settings.tribute.rules.previewSection")}
						</h3>
						<div className={styles.fields}>
							<p className={styles.help}>{t("settings.tribute.rules.previewHint")}</p>
							<div className={styles.previewControls}>
								<FormField
									label={t("settings.tribute.rules.previewAmount", { currency: draft.currency })}
									htmlFor="commerce-preview-amount"
								>
									<FormFieldInput
										id="commerce-preview-amount"
										inputMode="decimal"
										value={previewAmount}
										onChange={(event) => setPreviewAmount(event.target.value)}
									/>
								</FormField>
								<ActionBtn
									variant="action"
									size="md"
									loading={preview.isPending}
									disabled={!input || previewAmountMinor === null}
									onClick={() => {
										if (!input || previewAmountMinor === null) return;
										const fingerprint = JSON.stringify({ input, previewAmountMinor });
										preview.reset();
										setPreviewFingerprint(fingerprint);
										preview.mutate({ rule: input, amountMinor: previewAmountMinor });
									}}
								>
									{t("settings.tribute.rules.previewAction")}
								</ActionBtn>
							</div>
							{previewData && (
								<output className={styles.previewResult}>
									<strong>
										{previewData.matched
											? t("settings.tribute.rules.previewMatched", {
													count: previewData.durationDays,
												})
											: t("settings.tribute.rules.previewNoMatch")}
									</strong>
									{previewData.matchedBand && (
										<span>
											{t("settings.tribute.rules.previewBand", {
												amount: formatMinorMoney(
													previewData.matchedBand.fromAmountMinor,
													draft.currency,
												),
											})}
										</span>
									)}
								</output>
							)}
							{previewError && <InlineFeedback>{previewErrorCopy()}</InlineFeedback>}
						</div>
					</section>
				)}

				{rule && (
					<section className={styles.dangerZone}>
						<div>
							<strong>{t("settings.tribute.rules.deleteTitle")}</strong>
							<span>{t("settings.tribute.rules.deleteHint")}</span>
						</div>
						<ActionBtn
							ref={deleteTriggerRef}
							variant="dangerOutline"
							size="sm"
							onClick={() => setConfirmDelete(true)}
						>
							{t("settings.tribute.rules.deleteAction")}
						</ActionBtn>
					</section>
				)}

				{save.isError && (
					<InlineFeedback>
						{getLocalizedError(save.error, "settings.tribute.rules.saveError")}
					</InlineFeedback>
				)}
				{remove.isError && (
					<InlineFeedback>
						{getLocalizedError(remove.error, "settings.tribute.rules.deleteError")}
					</InlineFeedback>
				)}
			</EditorDialog>

			<ConfirmDialog
				open={confirmDelete}
				title={t("settings.tribute.rules.deleteConfirmTitle")}
				confirmLabel={t("settings.tribute.rules.deleteAction")}
				cancelLabel={t("access.cancel")}
				confirmVariant="danger"
				returnFocusRef={deleteTriggerRef}
				onCancel={() => setConfirmDelete(false)}
				onConfirm={() => {
					if (!rule) return;
					remove.mutate(rule.id, { onSuccess: onClose });
				}}
			>
				{t("settings.tribute.rules.deleteConfirmBody", { name: rule?.name })}
			</ConfirmDialog>
		</>
	);
}

type Translate = ReturnType<typeof useTranslation>["t"];

const SUBSCRIPTION_PERIOD_KEYS: Record<TributeSubscriptionPeriod, string> = {
	trial: "settings.tribute.rules.period.trial",
	onetime: "settings.tribute.rules.period.onetime",
	weekly: "settings.tribute.rules.period.weekly",
	monthly: "settings.tribute.rules.period.monthly",
	quarterly: "settings.tribute.rules.period.quarterly",
	halfyearly: "settings.tribute.rules.period.halfyearly",
	yearly: "settings.tribute.rules.period.yearly",
};

function subscriptionLabel(subscription: CommerceCatalogSubscription, t: Translate): string {
	const prices = subscription.periods
		.map(
			(period) =>
				`${formatMajorMoney(period.priceMajor, subscription.currency)} / ${t(
					SUBSCRIPTION_PERIOD_KEYS[period.period],
				)}`,
		)
		.join(", ");
	return prices ? `${subscription.name} · ${prices}` : subscription.name;
}
