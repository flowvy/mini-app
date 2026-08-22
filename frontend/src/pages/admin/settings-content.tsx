import { useSearch } from "@tanstack/react-router";
import type { FC } from "react";
import { ContentConfig } from "../../components/admin/content-config.tsx";
import { ErrorState } from "../../components/ui/error-state.tsx";
import { PageLoading } from "../../components/ui/page-loading.tsx";
import { useAdminSettings } from "../../hooks/use-admin-settings.ts";

export const AdminContentConfig: FC = () => {
	const search = useSearch({ from: "/admin/settings/content" });
	const { settings, isPending, error, refetch } = useAdminSettings();

	if (isPending || (!settings && !error)) return <PageLoading />;
	if (error || !settings) return <ErrorState onAction={refetch} />;

	return <ContentConfig settings={settings} initialMessageKey={search.message} />;
};
