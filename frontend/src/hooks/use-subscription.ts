/**
 * Subscription data hook — returns mock data for now.
 * Replace internals with API call when Remnawave is integrated.
 */
import { useEffect, useState } from "react";
import type { SubscriptionData } from "../types/subscription.ts";

interface SubscriptionState {
	subscription: SubscriptionData | null;
	isLoading: boolean;
}

const MOCK_SUBSCRIPTION: SubscriptionData = {
	id: "sub-1",
	name: "Flowvy VPN",
	status: "ACTIVE",
	usedBytes: 4.2 * 1024 ** 3,
	totalBytes: 50 * 1024 ** 3,
	expiresAt: Math.floor(Date.now() / 1000) + 23 * 86400,
	createdAt: Math.floor(Date.now() / 1000) - 90 * 86400,
	deviceLimit: 3,
	resetStrategy: "MONTH",
	refillDate: Math.floor(Date.now() / 1000) + 8 * 86400,
	lifetimeUsedBytes: 128.7 * 1024 ** 3,
	updatedAt: new Date(Date.now() - 12 * 60_000).toISOString(),
	connectionLink: "vless://mock-connection-link-abc123@example.com:443",
	email: "user@example.com",
	telegramId: "123456789",
	autoUpdate: true,
	updateInterval: 24,
	supportUrl: "https://support.flowvy.app",
	renewUrl: "https://flowvy.app/renew",
};

export function useSubscription(): SubscriptionState {
	const [state, setState] = useState<SubscriptionState>({
		subscription: null,
		isLoading: true,
	});

	useEffect(() => {
		const timer = setTimeout(() => {
			setState({ subscription: MOCK_SUBSCRIPTION, isLoading: false });
		}, 300);
		return () => clearTimeout(timer);
	}, []);

	return state;
}
