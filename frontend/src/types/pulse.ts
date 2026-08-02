export interface PulseHeartbeat {
	status: number;
	ping: number | null;
}

export interface PulseMonitor {
	id: number | string;
	name: string;
	status: "up" | "down" | "pending" | "maintenance";
	uptime24H: number;
	heartbeats: PulseHeartbeat[];
}

export interface PulseGroup {
	name: string;
	monitors: PulseMonitor[];
}

export interface PulseIncident {
	title: string;
	createdAt: string;
}

export interface PulseData {
	overallStatus: "operational" | "partial" | "maintenance" | "down";
	groups: PulseGroup[];
	incidents: PulseIncident[];
}
