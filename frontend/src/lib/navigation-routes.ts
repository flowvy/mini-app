const PRIMARY_TAB_PATHS = new Set([
	"/",
	"/pulse",
	"/devices",
	"/support",
	"/admin/dashboard",
	"/admin/users",
	"/admin/broadcast",
	"/admin/settings",
]);

function stripTrailingSlash(pathname: string): string {
	return pathname === "/" ? pathname : pathname.replace(/\/+$/, "");
}

export function isPrimaryTabRoute(pathname: string): boolean {
	return PRIMARY_TAB_PATHS.has(stripTrailingSlash(pathname));
}
