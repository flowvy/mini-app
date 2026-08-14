import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useEntitlementOperations } from "../../hooks/use-commerce-rules.ts";
import { formatDateISO } from "../../lib/format.ts";
import { formatMinorMoney } from "../../lib/money.ts";
import type { EntitlementOperation, EntitlementOperationStatus } from "../../types/commerce.ts";
import { ActionBtn } from "../ui/action-btn.tsx";
import { InlineFeedback } from "../ui/inline-feedback.tsx";
import styles from "./commerce-activity.module.css";
import { SettingsDivider, SettingsPanel, SettingsStatusRow } from "./settings-surface.tsx";

type ActivityTone = "default" | "positive" | "warning" | "negative";

const STATUS_TONE: Record<EntitlementOperationStatus, ActivityTone> = {
	pending: "default",
	processing: "default",
	retry: "warning",
	applied: "positive",
	review: "warning",
	cancelled: "default",
};

const STATUS_KEYS: Record<EntitlementOperationStatus, string> = {
	pending: "settings.tribute.activity.status.pending",
	processing: "settings.tribute.activity.status.processing",
	retry: "settings.tribute.activity.status.retry",
	applied: "settings.tribute.activity.status.applied",
	review: "settings.tribute.activity.status.review",
	cancelled: "settings.tribute.activity.status.cancelled",
};

const EVENT_KEYS: Record<string, string> = {
	new_digital_product: "settings.tribute.activity.event.new_digital_product",
	digital_product_refunded: "settings.tribute.activity.event.digital_product_refunded",
	new_donation: "settings.tribute.activity.event.new_donation",
	recurrent_donation: "settings.tribute.activity.event.recurrent_donation",
	cancelled_donation: "settings.tribute.activity.event.cancelled_donation",
	new_subscription: "settings.tribute.activity.event.new_subscription",
	renewed_subscription: "settings.tribute.activity.event.renewed_subscription",
	cancelled_subscription: "settings.tribute.activity.event.cancelled_subscription",
};

const UNKNOWN_EVENT_KEY = "settings.tribute.activity.event.other";

const REASON_KEYS: Record<string, string> = {
	cancellation_is_not_refund: "settings.tribute.activity.reason.cancellation_is_not_refund",
	semantic_identity_unverified: "settings.tribute.activity.reason.semantic_identity_unverified",
	unsupported_event: "settings.tribute.activity.reason.unsupported_event",
	purchase_identity_missing: "settings.tribute.activity.reason.purchase_identity_missing",
	telegram_identity_missing: "settings.tribute.activity.reason.telegram_identity_missing",
	user_not_found: "settings.tribute.activity.reason.user_not_found",
	user_inactive: "settings.tribute.activity.reason.user_inactive",
	subscription_not_found: "settings.tribute.activity.reason.subscription_not_found",
	subscription_ambiguous: "settings.tribute.activity.reason.subscription_ambiguous",
	rule_calculation_invalid: "settings.tribute.activity.reason.rule_calculation_invalid",
	rule_not_found: "settings.tribute.activity.reason.rule_not_found",
	profile_unavailable: "settings.tribute.activity.reason.profile_unavailable",
	profile_not_grantable: "settings.tribute.activity.reason.profile_not_grantable",
	purchase_already_refunded: "settings.tribute.activity.reason.purchase_already_refunded",
	refunded_before_apply: "settings.tribute.activity.reason.refunded_before_apply",
	grant_cancelled_before_apply: "settings.tribute.activity.reason.grant_cancelled_before_apply",
	refund_source_not_found: "settings.tribute.activity.reason.refund_source_not_found",
	no_grant_to_compensate: "settings.tribute.activity.reason.no_grant_to_compensate",
	provider_identity_missing: "settings.tribute.activity.reason.provider_identity_missing",
	provider_identity_mismatch: "settings.tribute.activity.reason.provider_identity_mismatch",
	grant_plan_incomplete: "settings.tribute.activity.reason.grant_plan_incomplete",
	profile_snapshot_invalid: "settings.tribute.activity.reason.profile_snapshot_invalid",
	provider_state_conflict: "settings.tribute.activity.reason.provider_state_conflict",
	provider_state_mismatch: "settings.tribute.activity.reason.provider_state_mismatch",
	refund_history_incomplete: "settings.tribute.activity.reason.refund_history_incomplete",
	refund_requires_revocation: "settings.tribute.activity.reason.refund_requires_revocation",
	provider_temporarily_unavailable:
		"settings.tribute.activity.reason.provider_temporarily_unavailable",
	provider_unavailable: "settings.tribute.activity.reason.provider_unavailable",
	provider_rejected: "settings.tribute.activity.reason.provider_rejected",
	worker_interrupted: "settings.tribute.activity.reason.worker_interrupted",
};

const UNKNOWN_REASON_KEY = "settings.tribute.activity.reason.unknown";

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
			t("settings.tribute.activity.target", { date: formatDateISO(operation.targetExpiry) }),
		);
	}
	if (operation.reasonCode) {
		details.unshift(t(REASON_KEYS[operation.reasonCode] ?? UNKNOWN_REASON_KEY));
	}
	return details.join(" · ");
}

export function CommerceActivity() {
	const { t } = useTranslation();
	const activity = useEntitlementOperations();

	return (
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
			{activity.isPending && (
				<output className={styles.state} aria-live="polite">
					{t("settings.tribute.activity.loading")}
				</output>
			)}
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
				<div key={operation.id}>
					{index > 0 && <SettingsDivider />}
					<SettingsStatusRow
						label={t(EVENT_KEYS[operation.eventName] ?? UNKNOWN_EVENT_KEY, {
							item: operation.externalItemId,
						})}
						status={t(STATUS_KEYS[operation.status])}
						tone={STATUS_TONE[operation.status]}
						description={operationDescription(operation, t)}
					/>
				</div>
			))}
			{activity.data?.hasMore && (
				<>
					<SettingsDivider />
					<p className={styles.more}>{t("settings.tribute.activity.more")}</p>
				</>
			)}
		</SettingsPanel>
	);
}
