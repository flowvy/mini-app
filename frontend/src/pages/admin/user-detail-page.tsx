/** Page wrapper for admin user detail — fetches user by UUID from route param. */
import { useNavigate, useParams } from "@tanstack/react-router";
import type { FC } from "react";
import { ErrorState } from "../../components/ui/error-state.tsx";
import { PageLoading } from "../../components/ui/page-loading.tsx";
import { useAdminUser } from "../../hooks/use-admin-users.ts";
import { ApiError } from "../../lib/api.ts";
import { UserDetailView } from "./user-detail.tsx";

export const AdminUserDetailPage: FC = () => {
	const { userId } = useParams({ from: "/admin/users/$userId" });
	const navigate = useNavigate();
	const { data: user, isPending, error, refetch } = useAdminUser(userId);

	if (isPending) return <PageLoading />;
	if (error instanceof ApiError && error.status === 404) {
		return <ErrorState variant="notFound" onAction={() => navigate({ to: "/admin/users" })} />;
	}
	if (error || !user) return <ErrorState onAction={refetch} />;

	return (
		<UserDetailView
			user={user}
			onDeleted={() => void navigate({ to: "/admin/users", replace: true })}
		/>
	);
};
