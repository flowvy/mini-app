/** Page wrapper for BeszelConfig sub-screen. */
import type { FC } from "react";
import { BeszelConfig } from "../../components/admin/beszel-config.tsx";
import { ErrorState } from "../../components/ui/error-state.tsx";
import { PageLoading } from "../../components/ui/page-loading.tsx";
import { useAdminSettings } from "../../hooks/use-admin-settings.ts";

export const AdminBeszelConfig: FC = () => {
	const { settings, isPending, error, refetch } = useAdminSettings();

	if (isPending || (!settings && !error)) return <PageLoading />;
	if (error || !settings) return <ErrorState onAction={refetch} />;

	return <BeszelConfig settings={settings} />;
};
