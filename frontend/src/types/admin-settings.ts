export interface AdminSettings {
	kumaEnabled: boolean;
	kumaUrl: string | null;
	kumaSlug: string | null;
	appName: string | null;
	logoUrl: string | null;
	welcomeText: string | null;
	welcomeMediaUrl: string | null;
	welcomeMediaType: string | null;
	welcomeMediaFileId: string | null;
	welcomeMediaFileName: string | null;
	welcomeButtonText: string | null;
	remnawaveVersion: string | null;
	flowvyVersion: string;
	updatedAt: number;
}

export interface AdminSettingsPatch {
	kumaEnabled?: boolean;
	kumaUrl?: string | null;
	kumaSlug?: string | null;
	appName?: string | null;
	logoUrl?: string | null;
	welcomeText?: string | null;
	welcomeMediaUrl?: string | null;
	welcomeMediaType?: string | null;
	welcomeMediaFileId?: string | null;
	welcomeMediaFileName?: string | null;
	welcomeButtonText?: string | null;
}

export interface WelcomeMediaUpload {
	fileId: string;
	fileName: string;
	mediaType: string;
}

export interface KumaTestResult {
	ok: boolean;
	error: string | null;
}
