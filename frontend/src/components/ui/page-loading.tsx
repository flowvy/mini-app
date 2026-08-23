import { PageSkeleton, pageSkeletonVariantForPath } from "./page-skeleton.tsx";

export function PageLoading() {
	return <PageSkeleton variant={pageSkeletonVariantForPath(window.location.pathname)} />;
}
