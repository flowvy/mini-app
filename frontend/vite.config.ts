import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react()],
	server: {
		port: 5173,
		host: "127.0.0.1",
		strictPort: true,
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
	preview: {
		port: 4173,
		host: "127.0.0.1",
		strictPort: true,
		proxy: {
			"/api": {
				target: "http://127.0.0.1:8001",
				changeOrigin: true,
			},
			"/webhook": {
				target: "http://127.0.0.1:8001",
				changeOrigin: true,
			},
		},
	},
	build: {
		rolldownOptions: {
			output: {
				codeSplitting: {
					groups: [
						{
							name: "i18n",
							test: /node_modules[\\/](?:i18next|react-i18next)/,
							includeDependenciesRecursively: true,
						},
						{
							name: "markdown",
							test: /node_modules[\\/](?:react-markdown|remark-breaks|remark-gfm)/,
							includeDependenciesRecursively: true,
						},
						{
							name: "richTextEditor",
							test: /node_modules[\\/](?:@floating-ui|@tiptap)/,
							includeDependenciesRecursively: true,
						},
					],
				},
			},
		},
	},
});
