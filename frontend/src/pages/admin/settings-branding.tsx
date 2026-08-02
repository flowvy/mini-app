/** Page wrapper for BrandingConfig sub-screen — loads settings, provides onBack. */
import { useNavigate, useRouter } from "@tanstack/react-router";
import type { FC } from "react";
import { useTranslation } from "react-i18next";
import { BrandingConfig } from "../../components/admin/branding-config.tsx";
import { PageLoading } from "../../components/ui/page-loading.tsx";
import { useAdminSettings } from "../../hooks/use-admin-settings.ts";
import styles from "./settings.module.css";

export const AdminBrandingConfig: FC = () => {
	const router = useRouter();
	const { t } = useTranslation();
	const navigate = useNavigate();
	const { settings, isPending, error } = useAdminSettings();

	const handleBack = () => {
		if (router.history.canGoBack()) router.history.back();
		else void navigate({ to: "/admin/settings" });
	};

	if (isPending || (!settings && !error)) return <PageLoading />;
	if (error || !settings) return <div className={styles.page}>{t("settings.error")}</div>;

	return <BrandingConfig settings={settings} onBack={handleBack} />;
};
