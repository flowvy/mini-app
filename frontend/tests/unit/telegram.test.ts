import { beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
	retrieveRawInitData: vi.fn<() => string | undefined>(),
}));

vi.mock("@telegram-apps/sdk-react", () => ({
	init: vi.fn(),
	miniApp: {},
	retrieveLaunchParams: vi.fn(),
	retrieveRawInitData: sdk.retrieveRawInitData,
	swipeBehavior: {},
	themeParams: {},
	viewport: {},
}));

describe("Telegram initData", () => {
	beforeEach(() => {
		vi.resetModules();
		sdk.retrieveRawInitData.mockReset();
	});

	it("retains the first SDK value in memory for later API mutations", async () => {
		sdk.retrieveRawInitData.mockReturnValueOnce("signed-init-data").mockImplementationOnce(() => {
			throw new Error("launch params are no longer available");
		});
		const { getRawInitData } = await import("../../src/lib/telegram.ts");

		expect(getRawInitData()).toBe("signed-init-data");
		expect(getRawInitData()).toBe("signed-init-data");
		expect(sdk.retrieveRawInitData).toHaveBeenCalledTimes(1);
	});
});
