import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 5173);
const artifactRoot = process.env.PLAYWRIGHT_ARTIFACT_DIR ?? join(tmpdir(), "flowvy-playwright");

export default defineConfig({
	testDir: "./tests/e2e",
	testIgnore: "**/live-smoke.spec.ts",
	outputDir: join(artifactRoot, "test-results"),
	fullyParallel: true,
	forbidOnly: Boolean(process.env.CI),
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : 3,
	reporter: [
		["line"],
		["html", { outputFolder: join(artifactRoot, "playwright-report"), open: "never" }],
	],
	use: {
		baseURL: `http://127.0.0.1:${port}`,
		locale: "en-US",
		timezoneId: "UTC",
		colorScheme: "dark",
		reducedMotion: "reduce",
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
		video: "retain-on-failure",
	},
	webServer: {
		command: `pnpm dev --host 127.0.0.1 --port ${port} --strictPort`,
		url: `http://127.0.0.1:${port}`,
		reuseExistingServer: false,
		timeout: 60_000,
		env: {
			VITE_MOCK_AUTH: "true",
			VITE_API_URL: "/api",
			VITE_DEBUG_TELEGRAM_ID: "",
			VITE_DEBUG_DEVICES_EMPTY: "false",
		},
	},
	projects: [
		{
			name: "mobile-chromium",
			use: {
				...devices["Desktop Chrome"],
				viewport: { width: 430, height: 932 },
				isMobile: true,
				hasTouch: true,
			},
		},
		{
			name: "small-mobile-chromium",
			use: {
				...devices["Desktop Chrome"],
				viewport: { width: 320, height: 568 },
				isMobile: true,
				hasTouch: true,
			},
		},
		{
			name: "ios-webkit",
			use: { ...devices["iPhone 13"] },
		},
		{
			name: "desktop-chromium",
			use: {
				...devices["Desktop Chrome"],
				viewport: { width: 1280, height: 900 },
			},
		},
	],
});
