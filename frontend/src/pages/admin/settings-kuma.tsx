/** Page wrapper for KumaConfig sub-screen — loads settings. */
import type { FC } from "react";
import { KumaConfig } from "../../components/admin/kuma-config.tsx";
import { ErrorState } from "../../components/ui/error-state.tsx";
import { PageLoading } from "../../components/ui/page-loading.tsx";
import { useAdminSettings } from "../../hooks/use-admin-settings.ts";

export const AdminKumaConfig: FC = () => {
	const { settings, isPending, error, refetch } = useAdminSettings();

	if (isPending || (!settings && !error)) return <PageLoading />;
	if (error || !settings) return <ErrorState onAction={refetch} />;

	return <KumaConfig settings={settings} />;
};
