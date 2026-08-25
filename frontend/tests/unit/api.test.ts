import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/telegram.ts", () => ({
	getRawInitData: () => undefined,
	getTelegramUserLocale: () => undefined,
}));

import { type ApiError, apiDelete, apiGet } from "../../src/lib/api.ts";

describe("API response handling", () => {
	beforeEach(() => {
		vi.unstubAllGlobals();
	});

	it("uses the same-origin API path by default", async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ ok: true }), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		await expect(apiGet<{ ok: boolean }>("/health")).resolves.toEqual({ ok: true });
		expect(fetchMock).toHaveBeenCalledWith(
			"/api/health",
			expect.objectContaining({ method: "GET" }),
		);
	});

	it("accepts an empty 204 mutation response", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

		await expect(apiDelete("/me/devices/device-1")).resolves.toBeUndefined();
	});

	it("uses a structured API detail for a failed request", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				new Response(JSON.stringify({ detail: "Authentication required" }), {
					status: 401,
					headers: { "content-type": "application/json" },
				}),
			),
		);

		await expect(apiGet("/me")).rejects.toEqual(
			expect.objectContaining<ApiError>({ status: 401, message: "Authentication required" }),
		);
	});

	it("preserves a machine-readable onboarding error code", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				new Response(
					JSON.stringify({
						detail: {
							code: "invite_required",
							message: "An invite code is required",
						},
					}),
					{ status: 403, headers: { "content-type": "application/json" } },
				),
			),
		);

		await expect(apiGet("/me")).rejects.toEqual(
			expect.objectContaining<ApiError>({
				status: 403,
				code: "invite_required",
				message: "An invite code is required",
			}),
		);
	});

	it("does not expose an untrusted HTML error body", async () => {
		vi.stubGlobal(
			"fetch",
			vi
				.fn()
				.mockResolvedValue(
					new Response("<html>private reverse proxy diagnostics</html>", { status: 502 }),
				),
		);

		await expect(apiGet("/pulse")).rejects.toEqual(
			expect.objectContaining<ApiError>({ status: 502, message: "Request failed (502)" }),
		);
	});

	it("rejects malformed success JSON", async () => {
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not-json", { status: 200 })));

		await expect(apiGet("/health")).rejects.toBeInstanceOf(SyntaxError);
	});
});
