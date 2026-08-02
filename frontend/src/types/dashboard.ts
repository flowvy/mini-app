/** Validated Remnawave system stats projection returned by the BFF. */
export interface RemnawaveStatusCounts {
	ACTIVE: number;
	DISABLED: number;
	LIMITED: number;
	EXPIRED: number;
}

export interface RemnawaveStats {
	cpu: { cores: number };
	memory: { total: number; free: number; used: number };
	uptime: number;
	users: { statusCounts: RemnawaveStatusCounts; totalUsers: number };
	onlineStats: {
		onlineNow: number;
		lastDay: number;
		lastWeek: number;
		neverOnline: number;
	};
	nodes: { totalOnline: number; totalBytesLifetime: string };
}

/** Single bandwidth comparison period. */
export interface BandwidthPeriod {
	current: string;
	previous: string;
	difference: string;
}

/** Validated Remnawave bandwidth projection returned by the BFF. */
export interface RemnawaveBandwidth {
	bandwidthLastTwoDays: BandwidthPeriod;
	bandwidthLastSevenDays: BandwidthPeriod;
	bandwidthLast30Days: BandwidthPeriod;
	bandwidthCalendarMonth: BandwidthPeriod;
	bandwidthCurrentYear: BandwidthPeriod;
}

export interface BotSystemStats {
	cpuCores: number;
	memoryTotal: number;
	memoryUsed: number;
	memoryPercent: number;
	uptimeSeconds: number;
	version: string;
}

export interface BotUserStats {
	totalUsers: number;
	newToday: number;
	newThisWeek: number;
	active1H: number;
	active24H: number;
}

export interface BotRequestStats {
	totalRequests: number;
	todayRequests: number;
}

export interface BotStats {
	system: BotSystemStats;
	users: BotUserStats;
	requests: BotRequestStats;
}

export interface DashboardResponse {
	remnawaveStats: RemnawaveStats | null;
	remnawaveBandwidth: RemnawaveBandwidth | null;
	bot: BotStats;
}
