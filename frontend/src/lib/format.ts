import type { ResetStrategy } from "../types/subscription.ts";

const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;
const TB = GB * 1024;

/** Format bytes to human-readable traffic string. */
export function formatTraffic(bytes: number): string {
	if (bytes <= 0) return "0";
	if (bytes >= TB) return `${(bytes / TB).toFixed(1)} TB`;
	const gb = bytes / GB;
	if (gb >= 100) return `${Math.round(gb)} GB`;
	if (gb >= 10) return `${gb.toFixed(1)} GB`;
	if (gb >= 1) return `${gb.toFixed(2)} GB`;
	const mb = bytes / MB;
	if (mb >= 1) return `${mb.toFixed(1)} MB`;
	return `${(bytes / KB).toFixed(0)} KB`;
}

/** Whether traffic limit is unlimited (0 = unlimited in Remnawave). */
export function isUnlimitedTraffic(totalBytes: number): boolean {
	return totalBytes === 0;
}

/** Whether expiry date is effectively unlimited (>10 years from now). */
export function isUnlimitedExpiry(expireUnix: number): boolean {
	const tenYears = 10 * 365 * 86400;
	const nowUnix = Math.floor(Date.now() / 1000);
	return expireUnix - nowUnix > tenYears;
}

/** Days until expiration (negative = expired). */
export function getDaysLeft(expireUnix: number): number {
	const nowUnix = Math.floor(Date.now() / 1000);
	return Math.floor((expireUnix - nowUnix) / 86400);
}

/** Traffic usage percent (0–100), clamped. */
export function getTrafficPercent(used: number, total: number): number {
	if (total <= 0) return 0;
	return Math.min(100, Math.round((used / total) * 100));
}

/** CSS variable for traffic color based on usage percent. */
export function getTrafficColor(pct: number): string {
	if (pct > 90) return "var(--v2-text-negative)";
	if (pct > 70) return "var(--v2-text-warning)";
	return "var(--v2-text-positive)";
}

/** CSS variable for days-left color. */
export function getExpiryColor(daysLeft: number): string {
	if (daysLeft < 0) return "var(--v2-text-negative)";
	if (daysLeft <= 7) return "var(--v2-text-warning)";
	return "var(--v2-text-primary)";
}

/** Human-readable expiry label. */
export function formatExpiry(daysLeft: number): string {
	if (daysLeft < 0) return "Expired";
	if (daysLeft === 0) return "Today";
	if (daysLeft === 1) return "1 day";
	return `${daysLeft}d`;
}

/** Format Unix timestamp to short date with year. */
export function formatShortDate(unix: number): string {
	const d = new Date(unix * 1000);
	const mo = d.toLocaleString("en", { month: "short" });
	return `${mo} ${d.getDate()}, ${d.getFullYear()}`;
}

/** Format Unix timestamp to compact month + day (no year). */
export function formatMonthDay(unix: number): string {
	const d = new Date(unix * 1000);
	const mo = d.toLocaleString("en", { month: "short" });
	return `${mo} ${d.getDate()}`;
}

/** Format Unix timestamp (seconds) to relative time. */
export function formatRelativeTimeUnix(unix: number): string {
	const diff = Date.now() - unix * 1000;
	const secs = Math.floor(diff / 1000);
	if (secs < 60) return "just now";
	const mins = Math.floor(secs / 60);
	if (mins < 60) return `${mins}m ago`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

/** Format traffic pair: "3.5 MB / 1 TB" or "5 GB / ∞". */
export function formatTrafficPair(used: number, limit: number): string {
	if (limit === 0) return `${formatTraffic(used)} / \u221E`;
	return `${formatTraffic(used)} / ${formatTraffic(limit)}`;
}

/** Format ISO date string to relative last-seen label. */
export function formatLastSeen(onlineAt: string | null): string {
	if (!onlineAt) return "Never";
	const diff = Date.now() - new Date(onlineAt).getTime();
	const mins = Math.floor(diff / 60000);
	if (mins < 1) return "now";
	if (mins < 60) return `${mins}m ago`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	if (days < 30) return `${days}d ago`;
	return `${Math.floor(days / 30)}mo ago`;
}

/** Format ISO expiry for admin users list. */
export function formatAdminExpiry(expireAt: string): string {
	const diff = new Date(expireAt).getTime() - Date.now();
	const days = Math.floor(diff / 86400000);
	if (days > 3650) return "\u221E";
	if (days < 0) return `expired ${Math.abs(days)}d ago`;
	if (days === 0) return "expires today";
	if (days <= 30) return `${days}d left`;
	return `${Math.floor(days / 30)}mo left`;
}

/** CSS var for admin expiry color (≤3d = warning, <0 = negative). */
export function getAdminExpiryColor(expireAt: string): string | null {
	const diff = new Date(expireAt).getTime() - Date.now();
	const days = Math.floor(diff / 86400000);
	if (days < 0) return "var(--v2-text-negative)";
	if (days <= 3) return "var(--v2-text-warning)";
	return null;
}

/** Format ISO date string to "Mon DD, YYYY". */
export function formatDateISO(iso: string | null): string {
	if (!iso) return "\u2014";
	const d = new Date(iso);
	const mo = d.toLocaleString("en", { month: "short" });
	return `${mo} ${d.getDate()}, ${d.getFullYear()}`;
}

/** Whether ISO expiry is effectively unlimited (year > 2090). */
export function isUnlimitedExpiryISO(iso: string): boolean {
	return new Date(iso).getFullYear() > 2090;
}

/** Whether device limit is unlimited (null or 0 in Remnawave). */
export function isUnlimitedDevices(limit: number | null | undefined): boolean {
	return !limit || limit === 0;
}

/** Days until ISO expiry (negative = expired). */
export function getDaysLeftISO(iso: string): number {
	return Math.floor((new Date(iso).getTime() - Date.now()) / 86400000);
}

/** CSS variable for ISO expiry color. */
export function getExpiryColorISO(daysLeft: number): string | undefined {
	if (daysLeft < 0) return "var(--v2-text-negative)";
	if (daysLeft <= 3) return "var(--v2-text-warning)";
	return undefined;
}

/** Compact expiry label for admin hero (days-based). */
export function formatExpiryCompact(daysLeft: number): string {
	if (daysLeft < 0) return `${Math.abs(daysLeft)}d ago`;
	if (daysLeft === 0) return "today";
	if (daysLeft <= 30) return `${daysLeft}d`;
	return `${Math.floor(daysLeft / 30)}mo`;
}

const RESET_LABELS: Record<ResetStrategy, string> = {
	MONTH: "Monthly",
	MONTH_ROLLING: "Monthly",
	WEEK: "Weekly",
	DAY: "Daily",
	NO_RESET: "Never",
};

/** Human-readable reset strategy label. */
export function formatResetStrategy(strategy: ResetStrategy): string {
	return RESET_LABELS[strategy];
}
