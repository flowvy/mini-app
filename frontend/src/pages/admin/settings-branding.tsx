/** Page wrapper for BrandingConfig sub-screen — loads settings. */
import type { FC } from "react";
import { BrandingConfig } from "../../components/admin/branding-config.tsx";
import { LoadErrorState } from "../../components/ui/load-error-state.tsx";
import { PageLoading } from "../../components/ui/page-loading.tsx";
import { useAdminSettings } from "../../hooks/use-admin-settings.ts";

export const AdminBrandingConfig: FC = () => {
	const { settings, isPending, error, refetch } = useAdminSettings();

	if (isPending || (!settings && !error)) return <PageLoading />;
	if (error || !settings) return <LoadErrorState onRetry={refetch} />;

	return <BrandingConfig settings={settings} />;
};
