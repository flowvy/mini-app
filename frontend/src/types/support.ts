export type SupportRequestStatus = "needs_reply" | "waiting_user" | "resolved";
export type SupportArticleTopic = "connection" | "subscription" | "devices" | "payment" | "other";
export type SupportArticleStatus = "draft" | "published" | "archived";

export interface SupportArticle {
	id: string;
	topic: SupportArticleTopic;
	title: string;
	summary: string;
	body: string;
	updatedAt: string;
}

export interface SupportArticlesResponse {
	articles: SupportArticle[];
}

export interface SupportArticleLocale {
	title: string;
	summary: string;
	body: string;
}

export interface SupportArticleAdmin {
	id: string;
	topic: SupportArticleTopic;
	status: SupportArticleStatus;
	sortOrder: number;
	contentLocales: Record<string, SupportArticleLocale>;
	publishedAt: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface SupportArticleAdminListResponse {
	articles: SupportArticleAdmin[];
}

export interface SupportArticleInput {
	topic: SupportArticleTopic;
	status: SupportArticleStatus;
	contentLocales: Record<string, SupportArticleLocale>;
}

type SupportAttachmentKind = "image" | "video" | "text" | "zip";

export interface SupportAttachment {
	id: string;
	name: string;
	kind: SupportAttachmentKind;
	sizeBytes: number;
	passwordProtected: boolean;
}

interface SupportRequester {
	id: number;
	fullName: string;
	username: string | null;
}

export interface SupportRequestSummary {
	id: string;
	number: number;
	topic: SupportArticleTopic;
	subject: string;
	status: SupportRequestStatus;
	updatedAt: string;
	lastMessagePreview: string;
	unreadCount: number;
	requester: SupportRequester;
}

interface SupportMessage {
	id: string;
	author: "user" | "support";
	authorName: string;
	body: string;
	createdAt: string;
	attachments: SupportAttachment[];
}

interface SupportRequestContext {
	subscriptionStatus: string | null;
	device: string | null;
	appVersion: string | null;
}

export interface SupportRequest extends SupportRequestSummary {
	messages: SupportMessage[];
	context: SupportRequestContext;
}

export interface SupportRequestsResponse {
	requests: SupportRequestSummary[];
}

export interface CreateSupportRequestInput {
	topic: SupportArticleTopic;
	subject: string;
	message: string;
	files: File[];
}

export interface ReplyToSupportRequestInput {
	requestId: string;
	message: string;
	files: File[];
}

export interface SupportCapabilities {
	attachmentsEnabled: boolean;
	maxFiles: number;
	maxFileBytes: number;
	maxTotalBytes: number;
	allowedExtensions: string[];
	attachmentRetentionDays: number;
	requestRetentionDays: number;
}

export interface SupportUploadFileInput {
	fileName: string;
	contentType: string;
	sizeBytes: number;
	checksumSha256: string;
}

interface SupportUploadTarget {
	id: string;
	uploadUrl: string;
	headers: Record<string, string>;
	expiresAt: string;
}

export interface SupportUploadIntentResponse {
	uploads: SupportUploadTarget[];
}

export interface SupportDownloadResponse {
	url: string;
	expiresAt: string;
	fileName: string;
}

export interface SupportStorageAdmin extends SupportCapabilities {
	configured: boolean;
	bucketName: string | null;
	endpoint: string | null;
	requiredEnvironment: string[];
}

export interface SupportStorageTestResponse {
	ok: boolean;
	errorCode: string | null;
}
