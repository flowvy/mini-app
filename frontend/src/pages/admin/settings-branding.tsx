/** Page wrapper for BrandingConfig sub-screen — loads settings. */
import type { FC } from "react";
import { BrandingConfig } from "../../components/admin/branding-config.tsx";
import { ErrorState } from "../../components/ui/error-state.tsx";
import { PageLoading } from "../../components/ui/page-loading.tsx";
import { useAdminSettings } from "../../hooks/use-admin-settings.ts";

export const AdminBrandingConfig: FC = () => {
	const { settings, isPending, error, refetch } = useAdminSettings();

	if (isPending || (!settings && !error)) return <PageLoading />;
	if (error || !settings) return <ErrorState onAction={refetch} />;

	return <BrandingConfig settings={settings} />;
};
