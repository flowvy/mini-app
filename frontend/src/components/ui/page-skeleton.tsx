import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import styles from "./page-skeleton.module.css";
import { Skeleton } from "./skeleton.tsx";

const PLACEHOLDER_KEYS = ["one", "two", "three", "four", "five", "six"] as const;

export type PageSkeletonVariant =
	| "home"
	| "list"
	| "devices"
	| "status"
	| "dashboard"
	| "settings"
	| "detail"
	| "generic";

function LoadingStatus({
	children,
	className,
	variant,
}: {
	children: ReactNode;
	className?: string;
	variant?: PageSkeletonVariant;
}) {
	const { t } = useTranslation();
	return (
		<div
			className={styles.status}
			aria-busy="true"
			data-ui="loading-skeleton"
			data-skeleton-variant={variant}
		>
			<output className={styles.visuallyHidden} aria-live="polite" aria-atomic="true">
				{t("common.loading")}
			</output>
			<div className={className} aria-hidden="true">
				{children}
			</div>
		</div>
	);
}

function SectionTitle() {
	return (
		<div className={styles.sectionTitle}>
			<Skeleton width="30%" height={9} radius={3} />
		</div>
	);
}

function ValueRow({ icon = false, tall = false }: { icon?: boolean; tall?: boolean }) {
	return (
		<div className={`${styles.row} ${tall ? styles.tallRow : ""}`}>
			{icon && <Skeleton width={32} height={32} radius={9} />}
			<div className={styles.rowCopy}>
				<Skeleton width="44%" height={12} radius={4} />
				<Skeleton width="72%" height={9} radius={3} />
			</div>
			<Skeleton width={52} height={16} radius={8} />
		</div>
	);
}

function Section({
	rows = 2,
	icons = false,
	tall = false,
}: {
	rows?: number;
	icons?: boolean;
	tall?: boolean;
}) {
	return (
		<div className={styles.section}>
			<SectionTitle />
			{PLACEHOLDER_KEYS.slice(0, rows).map((key) => (
				<ValueRow key={key} icon={icons} tall={tall} />
			))}
		</div>
	);
}

function HomeSkeleton() {
	return (
		<>
			<div className={styles.homeHero}>
				<div className={styles.homeHeroTop}>
					<Skeleton width="40%" height={16} radius={4} />
					<Skeleton width={60} height={16} radius={4} />
				</div>
				<Skeleton width="100%" height={6} radius={3} />
				<div className={styles.homeStats}>
					<Skeleton height={32} />
					<Skeleton height={32} />
					<Skeleton height={32} />
				</div>
			</div>
			<div className={styles.homeCard}>
				<Skeleton width="42%" height={14} radius={4} />
				<Skeleton width="78%" height={11} radius={4} />
				<Skeleton width="100%" height={44} radius={8} />
			</div>
			<Section rows={4} />
		</>
	);
}

function ListSkeleton() {
	return (
		<>
			<div className={styles.listControls}>
				<Skeleton width="100%" height={38} radius={16} />
				<div className={styles.chips}>
					{[58, 78, 88, 82].map((width) => (
						<Skeleton key={width} width={width} height={34} radius={18} />
					))}
				</div>
			</div>
			<div className={styles.listCards}>
				{PLACEHOLDER_KEYS.map((key) => (
					<div key={key} className={styles.listCard}>
						<Skeleton width={32} height={32} radius={9} />
						<div className={styles.rowCopy}>
							<Skeleton width="45%" height={12} radius={4} />
							<Skeleton width="76%" height={9} radius={3} />
						</div>
						<Skeleton width={48} height={14} radius={7} />
					</div>
				))}
			</div>
		</>
	);
}

function DevicesSkeleton() {
	return <Section rows={3} icons tall />;
}

function StatusSkeleton() {
	return (
		<>
			<div className={styles.statusBanner}>
				<Skeleton width={34} height={34} circle />
				<div className={styles.rowCopy}>
					<Skeleton width="35%" height={13} radius={4} />
					<Skeleton width="68%" height={9} radius={3} />
				</div>
			</div>
			<Section rows={3} icons />
			<Section rows={2} />
		</>
	);
}

function DashboardSkeleton() {
	return (
		<>
			<div className={styles.segmented}>
				<Skeleton height={34} radius={9} />
				<Skeleton height={34} radius={9} />
			</div>
			<div className={styles.kpiGrid}>
				{PLACEHOLDER_KEYS.slice(0, 4).map((key) => (
					<div className={styles.kpi} key={key}>
						<Skeleton width="58%" height={9} radius={3} />
						<Skeleton width="38%" height={20} radius={4} />
					</div>
				))}
			</div>
			<Section rows={4} />
		</>
	);
}

function SettingsSkeleton() {
	return (
		<>
			<Section rows={1} icons />
			<Section rows={1} icons />
			<Section rows={3} icons />
			<Section rows={2} icons />
		</>
	);
}

function DetailSkeleton() {
	return (
		<>
			<div className={styles.detailHero}>
				<div className={styles.detailIdentity}>
					<Skeleton width={44} height={44} circle />
					<div className={styles.rowCopy}>
						<Skeleton width="48%" height={15} radius={4} />
						<Skeleton width="30%" height={10} radius={3} />
					</div>
				</div>
				<Skeleton width="100%" height={42} radius={9} />
			</div>
			<Section rows={3} />
			<Section rows={2} />
		</>
	);
}

function GenericSkeleton() {
	return (
		<>
			<div className={styles.genericHero}>
				<Skeleton width={42} height={42} radius={12} />
				<Skeleton width="42%" height={16} radius={4} />
				<Skeleton width="72%" height={10} radius={3} />
			</div>
			<Section rows={3} />
		</>
	);
}

const skeletons: Record<PageSkeletonVariant, () => ReactNode> = {
	home: HomeSkeleton,
	list: ListSkeleton,
	devices: DevicesSkeleton,
	status: StatusSkeleton,
	dashboard: DashboardSkeleton,
	settings: SettingsSkeleton,
	detail: DetailSkeleton,
	generic: GenericSkeleton,
};

export function pageSkeletonVariantForPath(pathname: string): PageSkeletonVariant {
	if (pathname === "/") return "home";
	if (pathname === "/pulse") return "status";
	if (pathname === "/devices") return "devices";
	if (pathname.startsWith("/admin/users/search")) return "list";
	if (/^\/admin\/users\/[^/]+$/.test(pathname)) return "detail";
	if (pathname === "/admin/users") return "list";
	if (pathname === "/admin/dashboard") return "dashboard";
	if (pathname.startsWith("/admin/settings")) return "settings";
	return "generic";
}

export function PageSkeleton({ variant }: { variant: PageSkeletonVariant }) {
	const Content = skeletons[variant];
	return (
		<LoadingStatus className={`${styles.page} ${styles[variant]}`} variant={variant}>
			<Content />
		</LoadingStatus>
	);
}

export function SectionSkeleton({ rows = 3, fields = false }: { rows?: number; fields?: boolean }) {
	return (
		<LoadingStatus className={styles.inline}>
			{fields ? (
				<div className={styles.fields}>
					{PLACEHOLDER_KEYS.slice(0, rows).map((key) => (
						<div className={styles.field} key={key}>
							<Skeleton width="32%" height={9} radius={3} />
							<Skeleton width="100%" height={44} radius={8} />
							<Skeleton width="54%" height={8} radius={3} />
						</div>
					))}
				</div>
			) : (
				<div className={styles.inlineRows}>
					{PLACEHOLDER_KEYS.slice(0, rows).map((key) => (
						<ValueRow key={key} />
					))}
				</div>
			)}
		</LoadingStatus>
	);
}

export function EditorSkeleton() {
	return (
		<LoadingStatus className={styles.editor}>
			<div className={styles.editorToolbar}>
				{PLACEHOLDER_KEYS.slice(0, 5).map((key) => (
					<Skeleton width={28} height={28} radius={6} key={key} />
				))}
			</div>
			<div className={styles.editorBody}>
				<Skeleton width="84%" height={10} radius={3} />
				<Skeleton width="64%" height={10} radius={3} />
			</div>
		</LoadingStatus>
	);
}

export function LaunchSkeleton() {
	return (
		<LoadingStatus className={styles.launch}>
			<div className={styles.launchHeader}>
				<Skeleton width={22} height={22} radius={5} />
				<Skeleton width={92} height={16} radius={4} />
				<Skeleton width={62} height={30} radius={9} />
			</div>
			<div className={styles.launchContent}>
				<HomeSkeleton />
			</div>
		</LoadingStatus>
	);
}
