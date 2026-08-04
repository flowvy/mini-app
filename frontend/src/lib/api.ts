/**
 * HTTP client for Flowvy backend API.
 * Automatically attaches Telegram initData in Authorization header.
 */
import { getRawInitData } from "./telegram.ts";

const BASE_URL = import.meta.env.VITE_API_URL || "/api";

export class ApiError extends Error {
	constructor(
		public readonly status: number,
		message: string,
		public readonly code: string | null = null,
	) {
		super(message);
		this.name = "ApiError";
	}
}

interface ErrorPayload {
	message: string;
	code: string | null;
}

async function getErrorPayload(response: Response): Promise<ErrorPayload> {
	const fallback = `Request failed (${response.status})`;
	const payload = await response.text();
	if (!payload) return { message: fallback, code: null };

	try {
		const parsed = JSON.parse(payload) as { detail?: unknown };
		if (typeof parsed.detail === "string" && parsed.detail.trim()) {
			return { message: parsed.detail, code: null };
		}
		if (parsed.detail && typeof parsed.detail === "object") {
			const detail = parsed.detail as { code?: unknown; message?: unknown };
			return {
				message:
					typeof detail.message === "string" && detail.message.trim() ? detail.message : fallback,
				code: typeof detail.code === "string" && detail.code.trim() ? detail.code : null,
			};
		}
		return { message: fallback, code: null };
	} catch {
		// Never expose an upstream HTML page or another untrusted response body to the UI.
		return { message: fallback, code: null };
	}
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};

	const initData = getRawInitData();
	if (initData) {
		headers.Authorization = `tma ${initData}`;
	}

	const response = await fetch(`${BASE_URL}${path}`, {
		method,
		headers,
		body: body !== undefined ? JSON.stringify(body) : undefined,
	});

	if (!response.ok) {
		const error = await getErrorPayload(response);
		throw new ApiError(response.status, error.message, error.code);
	}

	if (response.status === 204) {
		return undefined as T;
	}
	const payload = await response.text();
	if (!payload) {
		return undefined as T;
	}
	return JSON.parse(payload) as T;
}

export function apiGet<T>(path: string): Promise<T> {
	return request<T>("GET", path);
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
	return request<T>("POST", path, body);
}

export function apiPatch<T>(path: string, body?: unknown): Promise<T> {
	return request<T>("PATCH", path, body);
}

export function apiPut<T>(path: string, body?: unknown): Promise<T> {
	return request<T>("PUT", path, body);
}

export function apiDelete<T = void>(path: string): Promise<T> {
	return request<T>("DELETE", path);
}

export async function apiUploadFile<T>(path: string, file: File): Promise<T> {
	const formData = new FormData();
	formData.append("file", file);
	const initData = getRawInitData();
	if (initData) {
		formData.append("initData", initData);
	}

	const response = await fetch(`${BASE_URL}${path}`, {
		method: "POST",
		body: formData,
	});

	if (!response.ok) {
		const error = await getErrorPayload(response);
		throw new ApiError(response.status, error.message, error.code);
	}

	return response.json() as Promise<T>;
}
