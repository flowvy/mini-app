import type { OperatorContentLocales } from "./operator-content.ts";

export type PulseProvider = "disabled" | "kuma" | "beszel";
export type InviteShareMediaType = "photo" | "animation" | "video";
export type InviteSharePreviewMode = "auto" | "hidden" | "small" | "large";

export interface AdminSettings {
	pulseProvider: PulseProvider;
	kumaUrl: string | null;
	kumaSlug: string | null;
	beszelUrl: string | null;
	beszelCredentialsConfigured: boolean;
	tributeCredentialsConfigured: boolean;
	tributeDonationUrl: string | null;
	tributeSubscriptionUrls: Record<string, string>;
	appName: string | null;
	logoUrl: string | null;
	welcomeText: string | null;
	welcomeMediaUrl: string | null;
	welcomeMediaType: string | null;
	welcomeMediaFileId: string | null;
	welcomeMediaFileName: string | null;
	welcomeButtonText: string | null;
	inviteShareMediaType: InviteShareMediaType | null;
	inviteShareMediaFileId: string | null;
	inviteShareMediaFileName: string | null;
	inviteSharePreviewMode: InviteSharePreviewMode;
	inviteShareAllowUserChats: boolean;
	inviteShareAllowBotChats: boolean;
	inviteShareAllowGroupChats: boolean;
	inviteShareAllowChannelChats: boolean;
	contentDefaultLocale: string;
	contentLocales: OperatorContentLocales;
	contentTemplateVariables: Record<string, string[]>;
	sponsorOfferTemplateVariables: string[];
	remnawaveVersion: string | null;
	flowvyVersion: string;
	updatedAt: number;
}

export interface AdminSettingsPatch {
	pulseProvider?: PulseProvider;
	kumaUrl?: string | null;
	kumaSlug?: string | null;
	beszelUrl?: string | null;
	tributeDonationUrl?: string | null;
	tributeSubscriptionUrls?: Record<string, string>;
	appName?: string | null;
	logoUrl?: string | null;
	welcomeText?: string | null;
	welcomeMediaUrl?: string | null;
	welcomeMediaType?: string | null;
	welcomeMediaFileId?: string | null;
	welcomeMediaFileName?: string | null;
	welcomeButtonText?: string | null;
	inviteShareMediaType?: InviteShareMediaType | null;
	inviteShareMediaFileId?: string | null;
	inviteShareMediaFileName?: string | null;
	inviteSharePreviewMode?: InviteSharePreviewMode;
	inviteShareAllowUserChats?: boolean;
	inviteShareAllowBotChats?: boolean;
	inviteShareAllowGroupChats?: boolean;
	inviteShareAllowChannelChats?: boolean;
	contentDefaultLocale?: string;
	contentLocales?: OperatorContentLocales;
}

export interface WelcomeMediaUpload {
	fileId: string;
	fileName: string;
	mediaType: string;
}

export interface ProviderTestResult {
	ok: boolean;
	error: string | null;
}

export type KumaTestResult = ProviderTestResult;
export type BeszelTestResult = ProviderTestResult;
export type TributeTestResult = ProviderTestResult;

export interface KumaTestInput {
	url: string;
	slug: string;
}

export interface BeszelTestInput {
	url: string;
}
