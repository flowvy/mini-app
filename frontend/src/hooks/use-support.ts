import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPut, apiPutExternal } from "../lib/api.ts";
import { queryKeys } from "../lib/query.ts";
import { isMockAuth } from "../lib/runtime.ts";
import { getTelegramPlatform } from "../lib/telegram.ts";
import type {
	CreateSupportRequestInput,
	ReplyToSupportRequestInput,
	SupportArticle,
	SupportArticleAdmin,
	SupportArticleAdminListResponse,
	SupportArticleInput,
	SupportArticlesResponse,
	SupportCapabilities,
	SupportDownloadResponse,
	SupportRequest,
	SupportRequestsResponse,
	SupportStorageAdmin,
	SupportStorageTestResponse,
	SupportUploadFileInput,
	SupportUploadIntentResponse,
} from "../types/support.ts";

const adminArticlesPrefix = isMockAuth
	? "/debug/admin/support/articles"
	: "/admin/support/articles";
const adminStoragePrefix = isMockAuth
	? "/debug/admin/settings/support-storage"
	: "/admin/settings/support-storage";

const FALLBACK_CONTENT_TYPES: Record<string, string> = {
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	png: "image/png",
	webp: "image/webp",
	heic: "image/heic",
	heif: "image/heif",
	mp4: "video/mp4",
	mov: "video/quicktime",
	webm: "video/webm",
	m4v: "video/mp4",
	txt: "text/plain",
	zip: "application/zip",
};

function fileContentType(file: File): string {
	const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "";
	return FALLBACK_CONTENT_TYPES[extension] || file.type.toLowerCase() || "application/octet-stream";
}

async function sha256Base64(file: File): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
	return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

async function uploadSupportFiles(files: File[]): Promise<string[]> {
	if (!files.length) return [];
	const metadata: SupportUploadFileInput[] = [];
	for (const file of files) {
		metadata.push({
			fileName: file.name,
			contentType: fileContentType(file),
			sizeBytes: file.size,
			checksumSha256: await sha256Base64(file),
		});
	}
	const intent = await apiPost<SupportUploadIntentResponse>("/support/uploads", {
		files: metadata,
	});
	if (intent.uploads.length !== files.length) {
		throw new Error("Support upload intent count mismatch");
	}
	for (const [index, target] of intent.uploads.entries()) {
		await apiPutExternal(target.uploadUrl, target.headers, files[index]);
	}
	return intent.uploads.map((target) => target.id);
}

export function useSupportArticles() {
	return useQuery({
		queryKey: queryKeys.supportArticles,
		queryFn: () => apiGet<SupportArticlesResponse>("/support/articles"),
		staleTime: 60_000,
	});
}

export function useSupportArticle(articleId: string) {
	return useQuery({
		queryKey: queryKeys.supportArticle(articleId),
		queryFn: () => apiGet<SupportArticle>(`/support/articles/${encodeURIComponent(articleId)}`),
	});
}

export function useAdminSupportArticles() {
	return useQuery({
		queryKey: queryKeys.adminSupportArticles,
		queryFn: () => apiGet<SupportArticleAdminListResponse>(adminArticlesPrefix),
	});
}

export function useAdminSupportArticle(articleId: string) {
	return useQuery({
		queryKey: queryKeys.adminSupportArticle(articleId),
		queryFn: () =>
			apiGet<SupportArticleAdmin>(`${adminArticlesPrefix}/${encodeURIComponent(articleId)}`),
		enabled: Boolean(articleId),
	});
}

export function useCreateSupportArticle() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (input: SupportArticleInput) =>
			apiPost<SupportArticleAdmin>(adminArticlesPrefix, input),
		onSuccess: async (article) => {
			queryClient.setQueryData(queryKeys.adminSupportArticle(article.id), article);
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: queryKeys.adminSupportArticles }),
				queryClient.invalidateQueries({ queryKey: queryKeys.supportArticles }),
			]);
		},
	});
}

export function useUpdateSupportArticle() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ articleId, input }: { articleId: string; input: SupportArticleInput }) =>
			apiPut<SupportArticleAdmin>(`${adminArticlesPrefix}/${encodeURIComponent(articleId)}`, input),
		onSuccess: async (article) => {
			queryClient.setQueryData(queryKeys.adminSupportArticle(article.id), article);
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: queryKeys.adminSupportArticles }),
				queryClient.invalidateQueries({ queryKey: queryKeys.supportArticles }),
				queryClient.invalidateQueries({ queryKey: queryKeys.supportArticle(article.id) }),
			]);
		},
	});
}

export function useReorderSupportArticles() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (articleIds: string[]) =>
			apiPut<SupportArticleAdminListResponse>(`${adminArticlesPrefix}/order/all`, { articleIds }),
		onSuccess: async (data) => {
			queryClient.setQueryData(queryKeys.adminSupportArticles, data);
			await queryClient.invalidateQueries({ queryKey: queryKeys.supportArticles });
		},
	});
}

export function useSupportRequests() {
	return useQuery({
		queryKey: queryKeys.supportRequests,
		queryFn: () => apiGet<SupportRequestsResponse>("/support/requests"),
		staleTime: 15_000,
	});
}

export function useSupportCapabilities() {
	return useQuery({
		queryKey: queryKeys.supportCapabilities,
		queryFn: () => apiGet<SupportCapabilities>("/support/capabilities"),
		staleTime: 60_000,
	});
}

export function useSupportRequest(requestId: string) {
	return useQuery({
		queryKey: queryKeys.supportRequest(requestId),
		queryFn: () => apiGet<SupportRequest>(`/support/requests/${encodeURIComponent(requestId)}`),
	});
}

export function useCreateSupportRequest() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async (input: CreateSupportRequestInput) => {
			const attachmentIds = await uploadSupportFiles(input.files);
			return apiPost<SupportRequest>("/support/requests", {
				topic: input.topic,
				subject: input.subject,
				message: input.message,
				attachmentIds,
				clientPlatform: getTelegramPlatform(),
			});
		},
		onSuccess: (request) => {
			queryClient.setQueryData(queryKeys.supportRequest(request.id), request);
			void queryClient.invalidateQueries({ queryKey: queryKeys.supportRequests });
		},
	});
}

export function useReplyToSupportRequest() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: async ({ requestId, message, files }: ReplyToSupportRequestInput) => {
			const attachmentIds = await uploadSupportFiles(files);
			return apiPost<SupportRequest>(
				`/support/requests/${encodeURIComponent(requestId)}/messages`,
				{ message, attachmentIds },
			);
		},
		onSuccess: (request) => {
			queryClient.setQueryData(queryKeys.supportRequest(request.id), request);
			void queryClient.invalidateQueries({ queryKey: queryKeys.supportRequests });
		},
	});
}

export function useSetSupportRequestResolved() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ requestId, resolved }: { requestId: string; resolved: boolean }) =>
			apiPost<SupportRequest>(
				`/support/requests/${encodeURIComponent(requestId)}/${resolved ? "resolve" : "reopen"}`,
			),
		onSuccess: (request) => {
			queryClient.setQueryData(queryKeys.supportRequest(request.id), request);
			void queryClient.invalidateQueries({ queryKey: queryKeys.supportRequests });
		},
	});
}

export function downloadSupportAttachment(attachmentId: string): Promise<SupportDownloadResponse> {
	return apiGet(`/support/attachments/${encodeURIComponent(attachmentId)}/download`);
}

export function useAdminSupportStorage() {
	return useQuery({
		queryKey: queryKeys.adminSupportStorage,
		queryFn: () => apiGet<SupportStorageAdmin>(adminStoragePrefix),
	});
}

export function useTestAdminSupportStorage() {
	return useMutation({
		mutationFn: () => apiPost<SupportStorageTestResponse>(`${adminStoragePrefix}/test`),
	});
}
