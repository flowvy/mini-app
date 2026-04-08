import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react()],
	server: {
		port: 5173,
		host: true,
		allowedHosts: true,
		proxy: {
			"/api": {
				target: "http://localhost:8001",
				changeOrigin: true,
			},
			"/webhook": {
				target: "http://localhost:8001",
				changeOrigin: true,
			},
		},
	},
	build: {
		rollupOptions: {
			output: {
				manualChunks: {
					i18n: ["i18next", "react-i18next", "i18next-resources-to-backend"],
				},
			},
		},
	},
});
