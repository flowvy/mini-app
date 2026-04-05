export interface DeviceData {
	hwid: string;
	platform: string | null;
	osVersion: string | null;
	deviceModel: string | null;
	createdAt: number;
}

export interface DevicesResponse {
	devices: DeviceData[];
	total: number;
	limit: number | null;
}
