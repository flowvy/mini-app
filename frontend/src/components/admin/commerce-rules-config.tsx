import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useCommerceRules, useSaveCommerceRule } from "../../hooks/use-commerce-rules.ts";
import { useAccessProfiles } from "../../hooks/use-registration-admin.ts";
import { getLocalizedError } from "../../lib/error-copy.ts";
import { formatMinorMoney } from "../../lib/money.ts";
import { type CommerceRule, commerceRuleInput } from "../../types/commerce.ts";
import { ActionBtn } from "../ui/action-btn.tsx";
import { InlineFeedback } from "../ui/inline-feedback.tsx";
import { Toggle } from "../ui/toggle.tsx";
import { CommerceRuleEditor } from "./commerce-rule-editor.tsx";
import styles from "./commerce-rules-config.module.css";
import { SettingsDivider, SettingsSection } from "./settings-surface.tsx";

interface EditorState {
	rule: CommerceRule | null;
	returnFocusTo: HTMLElement | null;
}

export function CommerceRulesConfig() {
	const { t } = useTranslation();
	const rules = useCommerceRules();
	const profiles = useAccessProfiles();
	const toggle = useSaveCommerceRule();
	const [editor, setEditor] = useState<EditorState | null>(null);
	const profileNames = new Map(
		(profiles.data ?? [])
			.filter((profile) => profile.isActive)
			.map((profile) => [profile.id, profile.name]),
	);
	const commerceTypeLabels = {
		donation: t("settings.tribute.rules.type.donation"),
		subscription: t("settings.tribute.rules.type.subscription"),
	};

	const summary = (rule: CommerceRule) => {
		if (rule.calculationType === "provider_expiry") {
			return t("settings.tribute.rules.providerExpirySummary");
		}
		if (rule.calculationType === "fixed") {
			return t("settings.tribute.rules.fixedSummary", { count: rule.fixedDurationDays });
		}
		const first = rule.amountBands[0];
		if (!first) return t("settings.tribute.rules.invalidSummary");
		return t("settings.tribute.rules.volumeSummary", {
			amount: formatMinorMoney(first.fromAmountMinor, rule.currency),
			count: rule.amountBands.length,
		});
	};

	return (
		<>
			<SettingsSection
				title={t("settings.tribute.rules.section")}
				action={
					<ActionBtn
						variant="action"
						size="sm"
						disabled={profiles.isPending || profiles.isError}
						onClick={(event) => setEditor({ rule: null, returnFocusTo: event.currentTarget })}
					>
						<Plus size={13} aria-hidden="true" /> {t("settings.tribute.rules.add")}
					</ActionBtn>
				}
			>
				<div className={styles.intro}>
					<strong>{t("settings.tribute.rules.introTitle")}</strong>
					<span>{t("settings.tribute.rules.introHint")}</span>
				</div>

				{(rules.isPending || profiles.isPending) && (
					<>
						<SettingsDivider />
						<p className={styles.state}>{t("settings.tribute.rules.loading")}</p>
					</>
				)}

				{(rules.isError || profiles.isError) && (
					<>
						<SettingsDivider />
						<div className={styles.errorState}>
							<InlineFeedback>{t("settings.tribute.rules.loadError")}</InlineFeedback>
							<ActionBtn
								variant="action"
								size="sm"
								onClick={() => void Promise.all([rules.refetch(), profiles.refetch()])}
							>
								{t("common.retry")}
							</ActionBtn>
						</div>
					</>
				)}

				{rules.isSuccess && profiles.isSuccess && rules.data.length === 0 && (
					<>
						<SettingsDivider />
						<div className={styles.empty}>
							<strong>{t("settings.tribute.rules.emptyTitle")}</strong>
							<span>{t("settings.tribute.rules.emptyHint")}</span>
							<ActionBtn
								variant="confirm"
								size="md"
								onClick={(event) => setEditor({ rule: null, returnFocusTo: event.currentTarget })}
							>
								{t("settings.tribute.rules.createFirst")}
							</ActionBtn>
						</div>
					</>
				)}

				{rules.data?.map((rule) => (
					<div className={styles.ruleBlock} key={rule.id}>
						<SettingsDivider />
						<div className={styles.ruleRow} data-enabled={rule.isEnabled ? "true" : "false"}>
							<button
								type="button"
								className={styles.editRule}
								onClick={(event) => setEditor({ rule, returnFocusTo: event.currentTarget })}
							>
								<span className={styles.ruleCopy}>
									<span className={styles.ruleTitleLine}>
										<strong>{rule.name}</strong>
										<span>{commerceTypeLabels[rule.commerceType]}</span>
									</span>
									<small>
										<span>{summary(rule)}</span>
										<span>
											{profileNames.get(rule.accessProfileId) ??
												t("settings.tribute.rules.profileUnavailable")}
										</span>
									</small>
								</span>
								<Pencil size={14} aria-hidden="true" />
							</button>
							<div className={styles.toggleCell}>
								<Toggle
									checked={rule.isEnabled}
									disabled={toggle.isPending}
									ariaLabel={t("settings.tribute.rules.toggleLabel", { name: rule.name })}
									onChange={(isEnabled) =>
										toggle.mutate({
											id: rule.id,
											input: { ...commerceRuleInput(rule), isEnabled },
										})
									}
								/>
							</div>
						</div>
					</div>
				))}
			</SettingsSection>

			{toggle.isError && (
				<InlineFeedback>
					{getLocalizedError(toggle.error, "settings.tribute.rules.toggleError")}
				</InlineFeedback>
			)}

			{editor && profiles.data && (
				<CommerceRuleEditor
					rule={editor.rule}
					rules={rules.data ?? []}
					profiles={profiles.data}
					returnFocusTo={editor.returnFocusTo}
					onClose={() => setEditor(null)}
				/>
			)}
		</>
	);
}
