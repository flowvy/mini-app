export interface AdminSettings {
	kumaEnabled: boolean;
	kumaUrl: string | null;
	kumaSlug: string | null;
	supportUrl: string | null;
	renewUrl: string | null;
	appName: string | null;
	logoUrl: string | null;
	remnawaveVersion: string | null;
	flowvyVersion: string;
	updatedAt: number;
}

export interface AdminSettingsPatch {
	kumaEnabled?: boolean;
	kumaUrl?: string | null;
	kumaSlug?: string | null;
	supportUrl?: string | null;
	renewUrl?: string | null;
	appName?: string | null;
	logoUrl?: string | null;
}

export interface KumaTestResult {
	ok: boolean;
	error: string | null;
}
