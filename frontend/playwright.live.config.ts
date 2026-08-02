import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "./tests/e2e",
	testMatch: "live-smoke.spec.ts",
	outputDir: "./test-results/live",
	fullyParallel: false,
	forbidOnly: true,
	retries: 0,
	workers: 1,
	reporter: [["line"]],
	use: {
		baseURL: "http://127.0.0.1:5173",
		locale: "en-US",
		timezoneId: "UTC",
		colorScheme: "dark",
		reducedMotion: "reduce",
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
		video: "retain-on-failure",
	},
	projects: [
		{
			name: "live-mobile-chromium",
			use: {
				...devices["Desktop Chrome"],
				viewport: { width: 430, height: 932 },
				isMobile: true,
				hasTouch: true,
			},
		},
	],
});
