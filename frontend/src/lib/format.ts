import i18n from "../i18n";
import type { ResetStrategy } from "../types/subscription.ts";

const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;
const TB = GB * 1024;
const LIFETIME_EXPIRY_START_MS = Date.UTC(2099, 0, 1);

export type ExpiryValue = number | string;

export interface ParsedExpiry {
	date: Date;
	isUnlimited: boolean;
}

/** Parse the Unix/ISO expiry contracts used by Flowvy through one lifetime-sentinel rule. */
export function parseExpiry(expiry: ExpiryValue | null): ParsedExpiry | null {
	if (expiry == null) return null;
	const timestamp = typeof expiry === "number" ? expiry * 1000 : Date.parse(expiry);
	if (!Number.isFinite(timestamp)) return null;
	return {
		date: new Date(timestamp),
		isUnlimited: timestamp >= LIFETIME_EXPIRY_START_MS,
	};
}

/** Format bytes to human-readable traffic string. */
export function formatTraffic(bytes: number): string {
	if (bytes <= 0) return i18n.t("format.number.zero");
	if (bytes >= TB) return formatTrafficValue((bytes / TB).toFixed(1), "format.traffic.tb");
	const gb = bytes / GB;
	if (gb >= 100) return formatTrafficValue(String(Math.round(gb)), "format.traffic.gb");
	if (gb >= 10) return formatTrafficValue(gb.toFixed(1), "format.traffic.gb");
	if (gb >= 1) return formatTrafficValue(gb.toFixed(2), "format.traffic.gb");
	const mb = bytes / MB;
	if (mb >= 1) return formatTrafficValue(mb.toFixed(1), "format.traffic.mb");
	return formatTrafficValue((bytes / KB).toFixed(0), "format.traffic.kb");
}

function formatTrafficValue(value: string, unitKey: string): string {
	return i18n.t("format.traffic.value", { value, unit: i18n.t(unitKey) });
}

/** Whether traffic limit is unlimited (0 = unlimited in Remnawave). */
export function isUnlimitedTraffic(totalBytes: number): boolean {
	return totalBytes === 0;
}

/** Whether expiry is Flowvy's documented lifetime sentinel. */
export function isUnlimitedExpiry(expiry: ExpiryValue): boolean {
	return parseExpiry(expiry)?.isUnlimited ?? false;
}

/** Days until expiration (negative = expired). */
export function getDaysLeft(expiry: ExpiryValue): number {
	const parsed = parseExpiry(expiry);
	if (!parsed) return 0;
	return Math.floor((parsed.date.getTime() - Date.now()) / 86400000);
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
	if (daysLeft < 0) return i18n.t("format.expiry.expired");
	if (daysLeft === 0) return i18n.t("format.expiry.today");
	if (daysLeft === 1) return i18n.t("format.expiry.oneDay");
	return i18n.t("format.expiry.days", { n: daysLeft });
}

/** Format Unix timestamp to short date with year. */
export function formatShortDate(unix: number): string {
	return formatCalendarDate(new Date(unix * 1000));
}

/** Format Unix timestamp to compact month + day (no year). */
export function formatMonthDay(unix: number): string {
	return new Intl.DateTimeFormat(i18n.language, { month: "short", day: "numeric" }).format(
		new Date(unix * 1000),
	);
}

/** Format Unix timestamp (seconds) to relative time. */
export function formatRelativeTimeUnix(unix: number): string {
	const diff = Date.now() - unix * 1000;
	const secs = Math.floor(diff / 1000);
	if (secs < 60) return i18n.t("format.relative.justNow");
	const mins = Math.floor(secs / 60);
	if (mins < 60) return i18n.t("format.relative.minutesAgo", { n: mins });
	const hours = Math.floor(mins / 60);
	if (hours < 24) return i18n.t("format.relative.hoursAgo", { n: hours });
	const days = Math.floor(hours / 24);
	return i18n.t("format.relative.daysAgo", { n: days });
}

/** Format traffic pair: "3.5 MB / 1 TB" or "5 GB / ∞". */
export function formatTrafficPair(used: number, limit: number): string {
	return formatRatio(
		formatTraffic(used),
		limit === 0 ? i18n.t("format.unlimitedSymbol") : formatTraffic(limit),
	);
}

/** Format ISO date string to relative last-seen label. */
export function formatLastSeen(onlineAt: string | null): string {
	if (!onlineAt) return i18n.t("format.lastSeen.never");
	const diff = Date.now() - new Date(onlineAt).getTime();
	const mins = Math.floor(diff / 60000);
	if (mins < 1) return i18n.t("format.lastSeen.now");
	if (mins < 60) return i18n.t("format.lastSeen.minutesAgo", { n: mins });
	const hours = Math.floor(mins / 60);
	if (hours < 24) return i18n.t("format.lastSeen.hoursAgo", { n: hours });
	const days = Math.floor(hours / 24);
	if (days < 30) return i18n.t("format.lastSeen.daysAgo", { n: days });
	return i18n.t("format.lastSeen.monthsAgo", { n: Math.floor(days / 30) });
}

/** Format ISO expiry for admin users list. */
export function formatAdminExpiry(expireAt: string): string {
	const parsed = parseExpiry(expireAt);
	if (!parsed) return formatMissing();
	if (parsed.isUnlimited) return i18n.t("format.unlimitedSymbol");
	const diff = parsed.date.getTime() - Date.now();
	const days = Math.floor(diff / 86400000);
	if (days < 0) return i18n.t("format.adminExpiry.expired", { n: Math.abs(days) });
	if (days === 0) return i18n.t("format.adminExpiry.today");
	if (days <= 30) return i18n.t("format.adminExpiry.daysLeft", { n: days });
	return i18n.t("format.adminExpiry.monthsLeft", { n: Math.floor(days / 30) });
}

/** CSS var for admin expiry color (≤3d = warning, <0 = negative). */
export function getAdminExpiryColor(expireAt: string): string | null {
	const parsed = parseExpiry(expireAt);
	if (!parsed || parsed.isUnlimited) return null;
	const diff = parsed.date.getTime() - Date.now();
	const days = Math.floor(diff / 86400000);
	if (days < 0) return "var(--v2-text-negative)";
	if (days <= 3) return "var(--v2-text-warning)";
	return null;
}

/** Format ISO date string to "Mon DD, YYYY". */
export function formatDateISO(iso: string | null): string {
	if (!iso) return formatMissing();
	return formatCalendarDate(new Date(iso));
}

/** Format an expiry consistently, including Flowvy's lifetime sentinel. */
export function formatExpiryDate(expiry: ExpiryValue | null): string {
	const parsed = parseExpiry(expiry);
	if (!parsed) return formatMissing();
	if (parsed.isUnlimited) return i18n.t("format.expiry.noExpiry");
	return formatCalendarDate(parsed.date);
}

function formatCalendarDate(date: Date): string {
	return new Intl.DateTimeFormat(i18n.language, {
		month: "short",
		day: "numeric",
		year: "numeric",
	}).format(date);
}

/** Whether device limit is unlimited (null or 0 in Remnawave). */
export function isUnlimitedDevices(limit: number | null | undefined): boolean {
	return !limit || limit === 0;
}

/** CSS variable for ISO expiry color. */
export function getExpiryColorISO(daysLeft: number): string | undefined {
	if (daysLeft < 0) return "var(--v2-text-negative)";
	if (daysLeft <= 3) return "var(--v2-text-warning)";
	return undefined;
}

/** Compact expiry label for admin hero (days-based). */
export function formatExpiryCompact(daysLeft: number): string {
	if (daysLeft < 0) return i18n.t("format.expiryCompact.ago", { n: Math.abs(daysLeft) });
	if (daysLeft === 0) return i18n.t("format.expiryCompact.today");
	if (daysLeft <= 30) return i18n.t("format.expiryCompact.days", { n: daysLeft });
	return i18n.t("format.expiryCompact.months", { n: Math.floor(daysLeft / 30) });
}

/** Format memory usage: "2.5 GB / 3.8 GB (66%)". */
export function formatMemory(used: number, total: number): string {
	const pct = total > 0 ? Math.round((used / total) * 100) : 0;
	return i18n.t("format.memory", {
		used: formatTraffic(used),
		total: formatTraffic(total),
		pct,
	});
}

export function formatMissing(): string {
	return i18n.t("format.missing");
}

export function formatRatio(current: string | number, total: string | number): string {
	return i18n.t("format.ratio", { current, total });
}

export function formatVersion(version: string): string {
	return i18n.t("format.version", { version });
}

export function formatPositiveNumber(value: number): string {
	return i18n.t("format.positiveNumber", { value });
}

export function formatTrend(difference: string): string {
	if (!difference) return "";
	const positive = !difference.startsWith("-");
	return i18n.t(positive ? "format.trend.up" : "format.trend.down", {
		value: difference.replace("-", ""),
	});
}

export function formatMetaList(parts: string[]): string {
	return parts.join(i18n.t("format.metaSeparator"));
}

/** Format uptime seconds: "39d 1h" or "5h". */
export function formatUptime(seconds: number): string {
	const d = Math.floor(seconds / 86400);
	const h = Math.floor((seconds % 86400) / 3600);
	if (d > 0) return i18n.t("format.uptime.daysHours", { d, h });
	return i18n.t("format.uptime.hours", { h });
}

const RESET_LABELS: Record<ResetStrategy, string> = {
	MONTH: "format.resetStrategy.monthly",
	MONTH_ROLLING: "format.resetStrategy.monthly",
	WEEK: "format.resetStrategy.weekly",
	DAY: "format.resetStrategy.daily",
	NO_RESET: "format.resetStrategy.never",
};

/** Human-readable reset strategy label. */
export function formatResetStrategy(strategy: ResetStrategy): string {
	return i18n.t(RESET_LABELS[strategy]);
}
