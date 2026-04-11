/** Page wrapper for WelcomeConfig sub-screen — loads settings, provides onBack. */
import { useNavigate, useRouter } from "@tanstack/react-router";
import type { FC } from "react";
import { WelcomeConfig } from "../../components/admin/welcome-config.tsx";
import { PageLoading } from "../../components/ui/page-loading.tsx";
import { useAdminSettings } from "../../hooks/use-admin-settings.ts";

export const AdminWelcomeConfig: FC = () => {
	const router = useRouter();
	const navigate = useNavigate();
	const { settings, isPending, error } = useAdminSettings();

	const handleBack = () => {
		if (router.history.canGoBack()) router.history.back();
		else void navigate({ to: "/admin/settings" });
	};

	if (isPending || (!settings && !error)) return <PageLoading />;
	if (error || !settings) return <div>Error</div>;

	return <WelcomeConfig settings={settings} onBack={handleBack} />;
};
