/** Page wrapper for the Tribute admin setup screen. */
import type { FC } from "react";
import { TributeConfig } from "../../components/admin/tribute-config.tsx";
import { ErrorState } from "../../components/ui/error-state.tsx";
import { PageLoading } from "../../components/ui/page-loading.tsx";
import { useAdminSettings } from "../../hooks/use-admin-settings.ts";

export const AdminTributeConfig: FC = () => {
	const { settings, isPending, error, refetch } = useAdminSettings();
	if (isPending || (!settings && !error)) return <PageLoading />;
	if (error || !settings) return <ErrorState onAction={refetch} />;
	return <TributeConfig settings={settings} />;
};
