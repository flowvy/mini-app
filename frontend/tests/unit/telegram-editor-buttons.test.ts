import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
	mainButton: {
		mount: Object.assign(vi.fn(), { isAvailable: vi.fn(() => true) }),
		setParams: Object.assign(vi.fn(), { isAvailable: vi.fn(() => true) }),
		onClick: Object.assign(vi.fn(), { isAvailable: vi.fn(() => true) }),
		unmount: vi.fn(),
	},
}));

vi.mock("@telegram-apps/sdk-react", () => sdk);

describe("Telegram editor main button", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		for (const method of [sdk.mainButton.mount, sdk.mainButton.setParams, sdk.mainButton.onClick]) {
			method.isAvailable.mockReturnValue(true);
		}
		sdk.mainButton.onClick.mockReturnValue(vi.fn());
		vi.stubGlobal("document", { documentElement: {} });
		vi.stubGlobal("getComputedStyle", () => ({
			getPropertyValue: (name: string) =>
				({
					"--v2-floor-0": "#171717",
					"--v2-bg-primary-inverted": "#ffffff",
					"--v2-text-primary-inverted": "#171717",
				})[name] ?? "",
		}));
	});

	afterEach(() => vi.unstubAllGlobals());

	it("mounts, updates, invokes, and removes the native primary action", async () => {
		const onPrimary = vi.fn();
		const removeMainClick = vi.fn();
		sdk.mainButton.onClick.mockReturnValue(removeMainClick);
		const { mountTelegramEditorButtons } = await import("../../src/lib/telegram-editor-buttons.ts");
		const controller = mountTelegramEditorButtons(
			{
				primaryText: "Create profile",
				primaryEnabled: false,
				primaryLoading: false,
			},
			{ onPrimary },
		);

		expect(controller).not.toBeNull();
		expect(sdk.mainButton.mount).toHaveBeenCalledOnce();
		expect(sdk.mainButton.setParams).toHaveBeenLastCalledWith({
			text: "Create profile",
			isEnabled: false,
			isLoaderVisible: false,
			isVisible: true,
			hasShineEffect: false,
			backgroundColor: "#747474",
			textColor: "#171717",
		});

		const mainListener = sdk.mainButton.onClick.mock.calls[0]?.[0];
		mainListener?.();
		expect(onPrimary).toHaveBeenCalledOnce();

		expect(
			controller?.update({
				primaryText: "Save",
				primaryEnabled: false,
				primaryLoading: true,
			}),
		).toBe(true);
		expect(sdk.mainButton.setParams).toHaveBeenLastCalledWith(
			expect.objectContaining({
				text: "Save",
				isEnabled: false,
				isLoaderVisible: true,
				backgroundColor: "#ffffff",
				textColor: "#171717",
			}),
		);

		controller?.destroy();
		expect(removeMainClick).toHaveBeenCalledOnce();
		expect(sdk.mainButton.setParams).toHaveBeenLastCalledWith({
			isVisible: false,
			isLoaderVisible: false,
		});
		expect(sdk.mainButton.unmount).toHaveBeenCalledOnce();
	});

	it("matches the previous light footer colors, including disabled opacity", async () => {
		vi.stubGlobal("getComputedStyle", () => ({
			getPropertyValue: (name: string) =>
				({
					"--v2-floor-0": "#f2f2f2",
					"--v2-bg-primary-inverted": "#171717",
					"--v2-text-primary-inverted": "#ffffff",
				})[name] ?? "",
		}));
		const { mountTelegramEditorButtons } = await import("../../src/lib/telegram-editor-buttons.ts");
		const controller = mountTelegramEditorButtons(
			{
				primaryText: "Create profile",
				primaryEnabled: false,
				primaryLoading: false,
			},
			{ onPrimary: vi.fn() },
		);

		expect(sdk.mainButton.setParams).toHaveBeenLastCalledWith(
			expect.objectContaining({
				isEnabled: false,
				backgroundColor: "#9a9a9a",
				textColor: "#f7f7f7",
			}),
		);
		controller?.destroy();
	});

	it("keeps the DOM fallback when Telegram MainButton is not available", async () => {
		sdk.mainButton.mount.isAvailable.mockReturnValue(false);
		const { mountTelegramEditorButtons } = await import("../../src/lib/telegram-editor-buttons.ts");

		expect(
			mountTelegramEditorButtons(
				{
					primaryText: "Save",
					primaryEnabled: true,
					primaryLoading: false,
				},
				{ onPrimary: vi.fn() },
			),
		).toBeNull();
		expect(sdk.mainButton.mount).not.toHaveBeenCalled();
	});

	it("waits until mounting before requiring setParams availability", async () => {
		let mainMounted = false;
		sdk.mainButton.mount.mockImplementation(() => {
			mainMounted = true;
		});
		sdk.mainButton.setParams.isAvailable.mockImplementation(() => mainMounted);
		const { mountTelegramEditorButtons } = await import("../../src/lib/telegram-editor-buttons.ts");
		const controller = mountTelegramEditorButtons(
			{
				primaryText: "Save",
				primaryEnabled: true,
				primaryLoading: false,
			},
			{ onPrimary: vi.fn() },
		);

		expect(controller).not.toBeNull();
		controller?.destroy();
	});
});
