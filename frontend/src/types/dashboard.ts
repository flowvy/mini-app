interface RemnawaveStatusCounts {
	ACTIVE: number;
	DISABLED: number;
	LIMITED: number;
	EXPIRED: number;
	UNKNOWN: number;
}

interface RemnawaveStats {
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

interface BandwidthPeriod {
	current: string;
	previous: string;
	difference: string;
}

interface RemnawaveBandwidth {
	bandwidthLastTwoDays: BandwidthPeriod;
	bandwidthLastSevenDays: BandwidthPeriod;
	bandwidthLast30Days: BandwidthPeriod;
	bandwidthCalendarMonth: BandwidthPeriod;
	bandwidthCurrentYear: BandwidthPeriod;
}

interface BotSystemStats {
	cpuCores: number;
	memoryTotal: number;
	memoryUsed: number;
	memoryPercent: number;
	uptimeSeconds: number;
	version: string;
}

interface BotUserStats {
	totalUsers: number;
	newToday: number;
	newThisWeek: number;
	active1H: number;
	active24H: number;
}

interface BotRequestStats {
	totalRequests: number;
	todayRequests: number;
}

interface BotStats {
	system: BotSystemStats;
	users: BotUserStats;
	requests: BotRequestStats;
}

export interface DashboardResponse {
	remnawaveStats: RemnawaveStats | null;
	remnawaveBandwidth: RemnawaveBandwidth | null;
	bot: BotStats;
}
