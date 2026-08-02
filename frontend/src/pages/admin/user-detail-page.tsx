/** Page wrapper for admin user detail — fetches user by UUID from route param. */
import { useNavigate, useParams, useRouter } from "@tanstack/react-router";
import type { FC } from "react";
import { LoadErrorState } from "../../components/ui/load-error-state.tsx";
import { PageLoading } from "../../components/ui/page-loading.tsx";
import { useAdminUser } from "../../hooks/use-admin-users.ts";
import { ApiError } from "../../lib/api.ts";
import { UserDetailView } from "./user-detail.tsx";

export const AdminUserDetailPage: FC = () => {
	const { userId } = useParams({ from: "/admin/users/$userId" });
	const router = useRouter();
	const navigate = useNavigate();
	const { data: user, isPending, error, refetch } = useAdminUser(userId);

	const handleBack = () => {
		if (router.history.canGoBack()) router.history.back();
		else void navigate({ to: "/admin/users" });
	};

	if (isPending) return <PageLoading />;
	if (error instanceof ApiError && error.status === 404) return <div>User not found</div>;
	if (error || !user) return <LoadErrorState onRetry={refetch} />;

	return <UserDetailView user={user} onBack={handleBack} />;
};
