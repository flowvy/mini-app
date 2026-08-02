/** Page wrapper for BeszelConfig sub-screen. */
import { useNavigate, useRouter } from "@tanstack/react-router";
import type { FC } from "react";
import { useTranslation } from "react-i18next";
import { BeszelConfig } from "../../components/admin/beszel-config.tsx";
import { PageLoading } from "../../components/ui/page-loading.tsx";
import { useAdminSettings } from "../../hooks/use-admin-settings.ts";
import styles from "./settings.module.css";

export const AdminBeszelConfig: FC = () => {
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

	return <BeszelConfig settings={settings} onBack={handleBack} />;
};
