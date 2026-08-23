import { RefreshCw } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	useActOnEntitlementOperation,
	useEntitlementOperations,
} from "../../hooks/use-commerce-rules.ts";
import { formatDateISO, formatExpiryDate } from "../../lib/format.ts";
import { formatMinorMoney } from "../../lib/money.ts";
import type {
	EntitlementOperation,
	EntitlementOperationStatus,
	EntitlementOperatorAction,
} from "../../types/commerce.ts";
import { ActionBtn } from "../ui/action-btn.tsx";
import { ConfirmDialog } from "../ui/confirm-dialog.tsx";
import { FormField, FormFieldTextarea } from "../ui/form-section.tsx";
import { InlineFeedback } from "../ui/inline-feedback.tsx";
import { SectionSkeleton } from "../ui/page-skeleton.tsx";
import styles from "./commerce-activity.module.css";
import { SettingsDivider, SettingsPanel, SettingsStatusRow } from "./settings-surface.tsx";

type ActivityTone = "default" | "positive" | "warning" | "negative";

const STATUS_TONE: Record<EntitlementOperationStatus, ActivityTone> = {
	pending: "default",
	processing: "default",
	retry: "warning",
	applied: "positive",
	review: "warning",
	resolved: "default",
	cancelled: "default",
};

const STATUS_KEYS: Record<EntitlementOperationStatus, string> = {
	pending: "settings.tribute.activity.status.pending",
	processing: "settings.tribute.activity.status.processing",
	retry: "settings.tribute.activity.status.retry",
	applied: "settings.tribute.activity.status.applied",
	review: "settings.tribute.activity.status.review",
	resolved: "settings.tribute.activity.status.resolved",
	cancelled: "settings.tribute.activity.status.cancelled",
};

const EVENT_KEYS: Record<string, string> = {
	new_donation: "settings.tribute.activity.event.new_donation",
	recurrent_donation: "settings.tribute.activity.event.recurrent_donation",
	cancelled_donation: "settings.tribute.activity.event.cancelled_donation",
	new_subscription: "settings.tribute.activity.event.new_subscription",
	renewed_subscription: "settings.tribute.activity.event.renewed_subscription",
	cancelled_subscription: "settings.tribute.activity.event.cancelled_subscription",
	effective_access_restore: "settings.tribute.activity.event.effective_access_restore",
	referral_reward: "settings.tribute.activity.event.referral_reward",
};

const UNKNOWN_EVENT_KEY = "settings.tribute.activity.event.other";

const REASON_KEYS: Record<string, string> = {
	cancellation_is_not_refund: "settings.tribute.activity.reason.cancellation_is_not_refund",
	semantic_identity_unverified: "settings.tribute.activity.reason.semantic_identity_unverified",
	unsupported_event: "settings.tribute.activity.reason.unsupported_event",
	subscription_identity_missing: "settings.tribute.activity.reason.subscription_identity_missing",
	provider_expiry_missing: "settings.tribute.activity.reason.provider_expiry_missing",
	anonymous_donation: "settings.tribute.activity.reason.anonymous_donation",
	donation_identity_missing: "settings.tribute.activity.reason.donation_identity_missing",
	donation_semantic_evidence_required:
		"settings.tribute.activity.reason.donation_semantic_evidence_required",
	donation_offer_mismatch: "settings.tribute.activity.reason.donation_offer_mismatch",
	telegram_identity_missing: "settings.tribute.activity.reason.telegram_identity_missing",
	user_not_found: "settings.tribute.activity.reason.user_not_found",
	user_inactive: "settings.tribute.activity.reason.user_inactive",
	subscription_not_found: "settings.tribute.activity.reason.subscription_not_found",
	subscription_ambiguous: "settings.tribute.activity.reason.subscription_ambiguous",
	rule_calculation_invalid: "settings.tribute.activity.reason.rule_calculation_invalid",
	rule_not_found: "settings.tribute.activity.reason.rule_not_found",
	profile_unavailable: "settings.tribute.activity.reason.profile_unavailable",
	profile_not_grantable: "settings.tribute.activity.reason.profile_not_grantable",
	refunded_before_apply: "settings.tribute.activity.reason.refunded_before_apply",
	grant_cancelled_before_apply: "settings.tribute.activity.reason.grant_cancelled_before_apply",
	no_grant_to_compensate: "settings.tribute.activity.reason.no_grant_to_compensate",
	provider_identity_missing: "settings.tribute.activity.reason.provider_identity_missing",
	provider_identity_mismatch: "settings.tribute.activity.reason.provider_identity_mismatch",
	grant_plan_incomplete: "settings.tribute.activity.reason.grant_plan_incomplete",
	profile_snapshot_invalid: "settings.tribute.activity.reason.profile_snapshot_invalid",
	provider_state_conflict: "settings.tribute.activity.reason.provider_state_conflict",
	provider_state_ahead: "settings.tribute.activity.reason.provider_state_ahead",
	paid_state_ahead: "settings.tribute.activity.reason.paid_state_ahead",
	provider_state_not_restorable: "settings.tribute.activity.reason.provider_state_not_restorable",
	baseline_missing: "settings.tribute.activity.reason.baseline_missing",
	superseded_by_effective_access: "settings.tribute.activity.reason.superseded_by_effective_access",
	provider_entitlement_expired: "settings.tribute.activity.reason.provider_entitlement_expired",
	provider_state_mismatch: "settings.tribute.activity.reason.provider_state_mismatch",
	refund_history_incomplete: "settings.tribute.activity.reason.refund_history_incomplete",
	refund_requires_revocation: "settings.tribute.activity.reason.refund_requires_revocation",
	provider_temporarily_unavailable:
		"settings.tribute.activity.reason.provider_temporarily_unavailable",
	provider_unavailable: "settings.tribute.activity.reason.provider_unavailable",
	provider_rejected: "settings.tribute.activity.reason.provider_rejected",
	worker_interrupted: "settings.tribute.activity.reason.worker_interrupted",
	operator_retry_queued: "settings.tribute.activity.reason.operator_retry_queued",
	operator_resolved: "settings.tribute.activity.reason.operator_resolved",
};

const UNKNOWN_REASON_KEY = "settings.tribute.activity.reason.unknown";

const ACTION_LABEL_KEYS: Record<EntitlementOperatorAction, string> = {
	retry: "settings.tribute.activity.action.retry",
	resolve: "settings.tribute.activity.action.resolve",
};

function operationDescription(
	operation: EntitlementOperation,
	t: ReturnType<typeof useTranslation>["t"],
): string {
	const details = [
		t("settings.tribute.activity.received", { date: formatDateISO(operation.providerCreatedAt) }),
	];
	if (operation.amountMinor !== null && operation.currency) {
		details.push(formatMinorMoney(operation.amountMinor, operation.currency));
	}
	if (operation.telegramUserId !== null) {
		details.push(t("settings.tribute.activity.telegramUser", { id: operation.telegramUserId }));
	}
	if (operation.durationDays !== null) {
		details.push(t("settings.tribute.activity.duration", { count: operation.durationDays }));
	}
	if (operation.targetExpiry) {
		details.push(
			t("settings.tribute.activity.target", { date: formatExpiryDate(operation.targetExpiry) }),
		);
	}
	if (operation.reasonCode) {
		details.unshift(t(REASON_KEYS[operation.reasonCode] ?? UNKNOWN_REASON_KEY));
	}
	if (operation.lastAction?.action === "resolve" && operation.lastAction.note) {
		details.unshift(
			t("settings.tribute.activity.action.resolvedNote", {
				note: operation.lastAction.note,
			}),
		);
	} else if (operation.lastAction?.action === "retry") {
		details.unshift(t("settings.tribute.activity.action.retryAudit"));
	}
	return details.join(" · ");
}

interface PendingDecision {
	operation: EntitlementOperation;
	action: EntitlementOperatorAction;
	requestId: string;
}

export function CommerceActivity() {
	const { t } = useTranslation();
	const activity = useEntitlementOperations();
	const actionMutation = useActOnEntitlementOperation();
	const returnFocusRef = useRef<HTMLElement>(null);
	const operationFocusRef = useRef<HTMLElement>(null);
	const [decision, setDecision] = useState<PendingDecision | null>(null);
	const [note, setNote] = useState("");

	const openDecision = (
		operation: EntitlementOperation,
		action: EntitlementOperatorAction,
		trigger: HTMLButtonElement,
	) => {
		actionMutation.reset();
		setNote("");
		returnFocusRef.current = trigger;
		operationFocusRef.current = trigger.closest<HTMLElement>("[data-entitlement-operation]");
		setDecision({ operation, action, requestId: crypto.randomUUID() });
	};

	const closeDecision = () => {
		if (actionMutation.isPending) return;
		actionMutation.reset();
		setDecision(null);
		setNote("");
	};

	const confirmDecision = () => {
		if (!decision) return;
		actionMutation.mutate(
			{
				id: decision.operation.id,
				input: {
					requestId: decision.requestId,
					action: decision.action,
					note: decision.action === "resolve" ? note.trim() : null,
				},
			},
			{
				onSuccess: () => {
					returnFocusRef.current = operationFocusRef.current;
					setDecision(null);
					setNote("");
				},
			},
		);
	};

	const decisionIsResolve = decision?.action === "resolve";
	const confirmDisabled = decisionIsResolve && note.trim().length === 0;

	return (
		<>
			<SettingsPanel
				title={t("settings.tribute.activity.section")}
				action={
					<ActionBtn
						variant="action"
						size="sm"
						loading={activity.isFetching && !activity.isPending}
						onClick={() => void activity.refetch()}
					>
						<RefreshCw size={13} aria-hidden="true" /> {t("settings.tribute.activity.refresh")}
					</ActionBtn>
				}
			>
				{activity.isPending && <SectionSkeleton rows={4} />}
				{activity.isError && (
					<div className={styles.error}>
						<InlineFeedback>{t("settings.tribute.activity.loadError")}</InlineFeedback>
						<ActionBtn variant="action" size="sm" onClick={() => void activity.refetch()}>
							{t("common.retry")}
						</ActionBtn>
					</div>
				)}
				{activity.data?.operations.length === 0 && (
					<SettingsStatusRow
						label={t("settings.tribute.activity.recent")}
						status={t("settings.tribute.activity.empty")}
						description={t("settings.tribute.activity.emptyHint")}
					/>
				)}
				{activity.data?.operations.map((operation, index) => (
					<article
						key={operation.id}
						className={styles.operation}
						data-entitlement-operation
						tabIndex={-1}
						aria-live="polite"
						aria-atomic="true"
					>
						{index > 0 && <SettingsDivider />}
						<SettingsStatusRow
							className={operation.availableActions.length ? styles.actionableRow : undefined}
							label={t(EVENT_KEYS[operation.eventName] ?? UNKNOWN_EVENT_KEY, {
								item: operation.externalItemId,
							})}
							status={t(STATUS_KEYS[operation.status])}
							tone={STATUS_TONE[operation.status]}
							description={operationDescription(operation, t)}
							action={
								operation.availableActions.length ? (
									<div className={styles.actions}>
										{operation.availableActions.map((action) => (
											<ActionBtn
												key={action}
												variant="action"
												size="sm"
												onClick={(event) => openDecision(operation, action, event.currentTarget)}
											>
												{t(ACTION_LABEL_KEYS[action])}
											</ActionBtn>
										))}
									</div>
								) : undefined
							}
						/>
					</article>
				))}
				{activity.data?.hasMore && (
					<>
						<SettingsDivider />
						<p className={styles.more}>{t("settings.tribute.activity.more")}</p>
					</>
				)}
			</SettingsPanel>

			<ConfirmDialog
				open={decision !== null}
				title={t(
					decisionIsResolve
						? "settings.tribute.activity.action.resolveTitle"
						: "settings.tribute.activity.action.retryTitle",
				)}
				confirmLabel={t(
					decisionIsResolve
						? "settings.tribute.activity.action.resolveConfirm"
						: "settings.tribute.activity.action.retryConfirm",
				)}
				cancelLabel={t("common.cancel")}
				confirmLoading={actionMutation.isPending}
				confirmDisabled={confirmDisabled}
				returnFocusRef={returnFocusRef}
				onCancel={closeDecision}
				onConfirm={confirmDecision}
			>
				<div className={styles.decisionBody}>
					<p>
						{t(
							decisionIsResolve
								? "settings.tribute.activity.action.resolveBody"
								: "settings.tribute.activity.action.retryBody",
						)}
					</p>
					{decisionIsResolve && (
						<FormField
							label={t("settings.tribute.activity.action.noteLabel")}
							htmlFor="entitlement-resolution-note"
							hint={t("settings.tribute.activity.action.noteHint")}
						>
							<FormFieldTextarea
								id="entitlement-resolution-note"
								value={note}
								onChange={(event) => setNote(event.target.value)}
								maxLength={500}
								rows={4}
								disabled={actionMutation.isPending}
								readOnly={actionMutation.isError}
							/>
						</FormField>
					)}
					{actionMutation.isError && (
						<InlineFeedback attention="action">
							{t("settings.tribute.activity.action.error")}
						</InlineFeedback>
					)}
				</div>
			</ConfirmDialog>
		</>
	);
}
