/**
 * HTTP client for Flowvy backend API.
 * Automatically attaches Telegram initData in Authorization header.
 */
import { getRawInitData } from "./telegram.ts";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8001/api";

export class ApiError extends Error {
	constructor(
		public readonly status: number,
		message: string,
	) {
		super(message);
		this.name = "ApiError";
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
		const detail = await response.text();
		throw new ApiError(response.status, detail);
	}

	return response.json() as Promise<T>;
}

export function apiGet<T>(path: string): Promise<T> {
	return request<T>("GET", path);
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
	return request<T>("POST", path, body);
}
