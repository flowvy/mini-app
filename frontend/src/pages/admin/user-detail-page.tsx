/** Page wrapper for admin user detail — fetches user by UUID from route param. */
import { useNavigate, useParams, useRouter } from "@tanstack/react-router";
import type { FC } from "react";
import { PageLoading } from "../../components/ui/page-loading.tsx";
import { useAdminUser } from "../../hooks/use-admin-users.ts";
import { UserDetailView } from "./user-detail.tsx";

export const AdminUserDetailPage: FC = () => {
	const { userId } = useParams({ from: "/admin/users/$userId" });
	const router = useRouter();
	const navigate = useNavigate();
	const { data: user, isPending, error } = useAdminUser(userId);

	const handleBack = () => {
		if (router.history.canGoBack()) router.history.back();
		else void navigate({ to: "/admin/users" });
	};

	if (isPending) return <PageLoading />;
	if (error || !user) return <div>User not found</div>;

	return <UserDetailView user={user} onBack={handleBack} />;
};
