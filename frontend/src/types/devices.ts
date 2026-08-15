export interface DeviceData {
	hwid: string;
	platform: string | null;
	osVersion: string | null;
	deviceModel: string | null;
	userAgent: string | null;
	requestIp: string | null;
	createdAt: number;
	updatedAt: number;
}

export interface DevicesResponse {
	devices: DeviceData[];
	total: number;
	limit: number | null;
}
