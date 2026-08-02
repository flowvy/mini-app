/** Local mock APIs are never allowed in a production bundle. */
export function resolveMockAuth(isDevelopment: boolean, requested: string | undefined): boolean {
	return isDevelopment && requested === "true";
}

export const isMockAuth = resolveMockAuth(import.meta.env.DEV, import.meta.env.VITE_MOCK_AUTH);
