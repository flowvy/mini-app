import { beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
	retrieveLaunchParams: vi.fn(),
	retrieveRawInitData: vi.fn<() => string | undefined>(),
}));

vi.mock("@telegram-apps/sdk-react", () => ({
	init: vi.fn(),
	miniApp: {},
	retrieveLaunchParams: sdk.retrieveLaunchParams,
	retrieveRawInitData: sdk.retrieveRawInitData,
	swipeBehavior: {},
	themeParams: {},
	viewport: {},
}));

describe("Telegram initData", () => {
	beforeEach(() => {
		vi.resetModules();
		sdk.retrieveRawInitData.mockReset();
		sdk.retrieveLaunchParams.mockReset();
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

	it("reads the optional Telegram user language from launch init data", async () => {
		sdk.retrieveLaunchParams.mockReturnValue({
			tgWebAppData: { user: { language_code: "ru-RU" } },
		});
		const { getTelegramUserLocale } = await import("../../src/lib/telegram.ts");

		expect(getTelegramUserLocale()).toBe("ru-RU");
	});

	it("returns no Telegram language outside a valid Mini App launch", async () => {
		sdk.retrieveLaunchParams.mockImplementation(() => {
			throw new Error("launch params unavailable");
		});
		const { getTelegramUserLocale } = await import("../../src/lib/telegram.ts");

		expect(getTelegramUserLocale()).toBeUndefined();
	});
});
