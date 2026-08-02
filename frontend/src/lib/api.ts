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
	) {
		super(message);
		this.name = "ApiError";
	}
}

async function getErrorMessage(response: Response): Promise<string> {
	const fallback = `Request failed (${response.status})`;
	const payload = await response.text();
	if (!payload) return fallback;

	try {
		const parsed = JSON.parse(payload) as { detail?: unknown };
		return typeof parsed.detail === "string" && parsed.detail.trim() ? parsed.detail : fallback;
	} catch {
		// Never expose an upstream HTML page or another untrusted response body to the UI.
		return fallback;
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
		throw new ApiError(response.status, await getErrorMessage(response));
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
		throw new ApiError(response.status, await getErrorMessage(response));
	}

	return response.json() as Promise<T>;
}
