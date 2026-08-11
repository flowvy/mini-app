/** Page wrapper for WelcomeConfig sub-screen — loads settings. */
import type { FC } from "react";
import { WelcomeConfig } from "../../components/admin/welcome-config.tsx";
import { ErrorState } from "../../components/ui/error-state.tsx";
import { PageLoading } from "../../components/ui/page-loading.tsx";
import { useAdminSettings } from "../../hooks/use-admin-settings.ts";

export const AdminWelcomeConfig: FC = () => {
	const { settings, isPending, error, refetch } = useAdminSettings();

	if (isPending || (!settings && !error)) return <PageLoading />;
	if (error || !settings) return <ErrorState onAction={refetch} />;

	return <WelcomeConfig settings={settings} />;
};
