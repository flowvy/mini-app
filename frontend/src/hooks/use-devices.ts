import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet } from "../lib/api.ts";
import { queryKeys } from "../lib/query.ts";
import { isMockAuth } from "../lib/runtime.ts";
import type { DevicesResponse } from "../types/devices.ts";

interface UseDevicesResult {
	devices: DevicesResponse | null;
	isPending: boolean;
	error: Error | null;
	refetch: () => void;
}

const debugTelegramId = import.meta.env.VITE_DEBUG_TELEGRAM_ID;

const debugEmpty = import.meta.env.VITE_DEBUG_DEVICES_EMPTY === "true";

function fetchDevices(): Promise<DevicesResponse> {
	if (isMockAuth && debugEmpty) {
		return apiGet<DevicesResponse>("/debug/empty-devices");
	}
	if (isMockAuth && debugTelegramId) {
		return apiGet<DevicesResponse>(`/debug/devices/${debugTelegramId}`);
	}
	return apiGet<DevicesResponse>("/me/devices");
}

export function useDevices(): UseDevicesResult {
	const { data, isPending, error, refetch } = useQuery({
		queryKey: queryKeys.devices,
		queryFn: fetchDevices,
		staleTime: 0,
		gcTime: 5 * 60 * 1000,
	});

	return {
		devices: data ?? null,
		isPending,
		error: error ?? null,
		refetch: () => {
			void refetch();
		},
	};
}

export function useDeleteDevice() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (hwid: string) => {
			if (isMockAuth && debugTelegramId) {
				return apiDelete(`/debug/devices/${debugTelegramId}/${hwid}`);
			}
			return apiDelete(`/me/devices/${hwid}`);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.devices });
			queryClient.invalidateQueries({ queryKey: queryKeys.subscription });
		},
	});
}

export function useDeleteAllDevices() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: () => {
			if (isMockAuth && debugTelegramId) {
				return apiDelete(`/debug/devices/${debugTelegramId}`);
			}
			return apiDelete("/me/devices");
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.devices });
			queryClient.invalidateQueries({ queryKey: queryKeys.subscription });
		},
	});
}
