import { useNavigate } from "@tanstack/react-router";
import { Gift, History, Link2, PanelsTopLeft, Plug, Workflow } from "lucide-react";
import type { FC, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CommerceActivity } from "../../components/admin/commerce-activity.tsx";
import { CommerceRulesConfig } from "../../components/admin/commerce-rules-config.tsx";
import { ReferralBenefitsConfig } from "../../components/admin/referral-benefits-config.tsx";
import {
	SettingsDivider,
	SettingsNavRow,
	SettingsSection,
} from "../../components/admin/settings-surface.tsx";
import { SponsorOffersConfig } from "../../components/admin/sponsor-offers-config.tsx";
import { TributeConnectionConfig } from "../../components/admin/tribute-config.tsx";
import { TributePaymentDestinations } from "../../components/admin/tribute-payment-destinations.tsx";
import { ErrorState } from "../../components/ui/error-state.tsx";
import { PageLoading } from "../../components/ui/page-loading.tsx";
import { useAdminSettings } from "../../hooks/use-admin-settings.ts";
import type { AdminSettings } from "../../types/admin-settings.ts";
import styles from "./settings.module.css";

const SettingsDataPage: FC<{ children: (settings: AdminSettings) => ReactNode }> = ({
	children,
}) => {
	const { settings, isPending, error, refetch } = useAdminSettings();
	if (isPending || (!settings && !error)) return <PageLoading />;
	if (error || !settings) return <ErrorState onAction={refetch} />;
	return children(settings);
};

export const AdminTributeConfig: FC = () => {
	const { t } = useTranslation();
	const navigate = useNavigate();

	return (
		<SettingsDataPage>
			{(settings) => (
				<div className={styles.page}>
					<p className={styles.screenIntro}>{t("settings.tribute.hub.intro")}</p>
					<SettingsSection title={t("settings.tribute.hub.setup")}>
						<SettingsNavRow
							icon={<Plug size={17} strokeWidth={1.8} aria-hidden="true" />}
							label={t("settings.tribute.connectionSection")}
							description={t("settings.tribute.hub.connectionDescription")}
							value={
								settings.tributeCredentialsConfigured
									? t("settings.configured")
									: t("settings.tribute.setupRequired")
							}
							tone={settings.tributeCredentialsConfigured ? "positive" : "warning"}
							onClick={() => navigate({ to: "/admin/settings/tribute/connection" })}
						/>
						<SettingsDivider />
						<SettingsNavRow
							icon={<Link2 size={17} strokeWidth={1.8} aria-hidden="true" />}
							label={t("settings.tribute.destinations.section")}
							description={t("settings.tribute.hub.paymentLinksDescription")}
							onClick={() => navigate({ to: "/admin/settings/tribute/payment-links" })}
						/>
						<SettingsDivider />
						<SettingsNavRow
							icon={<Gift size={17} strokeWidth={1.8} aria-hidden="true" />}
							label={t("settings.tribute.referrals.section")}
							description={t("settings.tribute.hub.referralsDescription")}
							value={
								settings.referralRewardEnabled || settings.welcomeDiscountEnabled
									? t("settings.tribute.hub.on")
									: t("settings.tribute.hub.off")
							}
							tone={
								settings.referralRewardEnabled || settings.welcomeDiscountEnabled
									? "positive"
									: "default"
							}
							onClick={() => navigate({ to: "/admin/settings/tribute/referral-benefits" })}
						/>
					</SettingsSection>

					<SettingsSection title={t("settings.tribute.hub.management")}>
						<SettingsNavRow
							icon={<Workflow size={17} strokeWidth={1.8} aria-hidden="true" />}
							label={t("settings.tribute.rules.section")}
							description={t("settings.tribute.hub.rulesDescription")}
							onClick={() => navigate({ to: "/admin/settings/tribute/automation-rules" })}
						/>
						<SettingsDivider />
						<SettingsNavRow
							icon={<PanelsTopLeft size={17} strokeWidth={1.8} aria-hidden="true" />}
							label={t("settings.tribute.offers.section")}
							description={t("settings.tribute.hub.offersDescription")}
							onClick={() => navigate({ to: "/admin/settings/tribute/sponsor-offers" })}
						/>
					</SettingsSection>

					<SettingsSection title={t("settings.tribute.hub.operations")}>
						<SettingsNavRow
							icon={<History size={17} strokeWidth={1.8} aria-hidden="true" />}
							label={t("settings.tribute.activity.section")}
							description={t("settings.tribute.hub.activityDescription")}
							onClick={() => navigate({ to: "/admin/settings/tribute/activity" })}
						/>
					</SettingsSection>
				</div>
			)}
		</SettingsDataPage>
	);
};

export const AdminTributeConnection: FC = () => (
	<SettingsDataPage>
		{(settings) => <TributeConnectionConfig settings={settings} />}
	</SettingsDataPage>
);

export const AdminTributePaymentLinks: FC = () => (
	<SettingsDataPage>
		{(settings) => (
			<div className={styles.formPage}>
				<TributePaymentDestinations settings={settings} />
			</div>
		)}
	</SettingsDataPage>
);

export const AdminTributeReferralBenefits: FC = () => (
	<SettingsDataPage>
		{(settings) => (
			<div className={styles.formPage}>
				<ReferralBenefitsConfig settings={settings} />
			</div>
		)}
	</SettingsDataPage>
);

export const AdminTributeAutomationRules: FC = () => (
	<div className={styles.formPage}>
		<CommerceRulesConfig />
	</div>
);

export const AdminTributeSponsorOffers: FC = () => (
	<SettingsDataPage>
		{(settings) => (
			<div className={styles.formPage}>
				<SponsorOffersConfig
					subscriptionUrls={settings.tributeSubscriptionUrls}
					contentDefaultLocale={settings.contentDefaultLocale}
					templateVariables={settings.sponsorOfferTemplateVariables}
				/>
			</div>
		)}
	</SettingsDataPage>
);

export const AdminTributeActivity: FC = () => (
	<div className={styles.formPage}>
		<CommerceActivity />
	</div>
);
