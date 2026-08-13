import { type AnimationEvent, type FC, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { DeviceRow } from "../components/devices/device-row.tsx";
import { ErrorState } from "../components/ui/error-state.tsx";
import { FormSection, FormSectionCard } from "../components/ui/form-section.tsx";
import { PageLoading } from "../components/ui/page-loading.tsx";
import { useDeleteAllDevices, useDeleteDevice, useDevices } from "../hooks/use-devices.ts";
import { type PreparedDustEffect, prepareDustEffect } from "../lib/dust-effect.ts";
import { formatRatio } from "../lib/format.ts";
import { hapticImpact, hapticNotification } from "../lib/haptics.ts";
import type { DeviceData } from "../types/devices.ts";
import styles from "./devices.module.css";

export const Devices: FC = () => {
	const { t } = useTranslation();
	const { devices: data, isPending, error, refetch } = useDevices();
	const deleteDevice = useDeleteDevice();
	const deleteAll = useDeleteAllDevices();
	const [confirmHwid, setConfirmHwid] = useState<string | null>(null);
	const [confirmAll, setConfirmAll] = useState(false);
	const [mutationError, setMutationError] = useState(false);
	const [renderedDevices, setRenderedDevices] = useState<DeviceData[]>([]);
	const [removingHwids, setRemovingHwids] = useState<Set<string>>(() => new Set());
	const [dustHwids, setDustHwids] = useState<Set<string>>(() => new Set());
	const [isBulkRemoving, setIsBulkRemoving] = useState(false);
	const removingHwidsRef = useRef<Set<string>>(new Set());
	const rowElementsRef = useRef<Map<string, HTMLDivElement>>(new Map());

	useLayoutEffect(() => {
		const incomingDevices = data?.devices ?? [];
		setRenderedDevices((currentDevices) => {
			if (removingHwidsRef.current.size === 0) {
				return incomingDevices;
			}

			const incomingByHwid = new Map(
				incomingDevices.map((device) => [device.hwid, device] as const),
			);
			const nextDevices = currentDevices.flatMap((device) => {
				const incomingDevice = incomingByHwid.get(device.hwid);
				if (incomingDevice) {
					incomingByHwid.delete(device.hwid);
					return [incomingDevice];
				}
				return removingHwidsRef.current.has(device.hwid) ? [device] : [];
			});

			for (const device of incomingDevices) {
				if (incomingByHwid.has(device.hwid)) {
					nextDevices.push(device);
				}
			}
			return nextDevices;
		});
	}, [data]);

	if (isPending) {
		return <PageLoading />;
	}

	if (error) {
		return <ErrorState onAction={refetch} />;
	}

	const limit = data?.limit ?? null;

	const prepareRemoval = (hwids: string[]) =>
		Promise.all(
			hwids.map(async (hwid) => ({
				hwid,
				effect: await prepareDustEffect(rowElementsRef.current.get(hwid)),
			})),
		);

	const cancelRemovalEffects = (
		preparedEffects: Promise<Array<{ hwid: string; effect: PreparedDustEffect | null }>>,
	) => {
		void preparedEffects.then((effects) => {
			for (const { effect } of effects) effect?.cancel();
		});
	};

	const startRemoval = async (
		hwids: string[],
		bulk: boolean,
		preparedEffects: Promise<Array<{ hwid: string; effect: PreparedDustEffect | null }>>,
	) => {
		for (const hwid of hwids) {
			removingHwidsRef.current.add(hwid);
		}
		const effects = await preparedEffects;
		const nextDustHwids = new Set(effects.flatMap(({ hwid, effect }) => (effect ? [hwid] : [])));
		setDustHwids((currentHwids) => new Set([...currentHwids, ...nextDustHwids]));
		setRemovingHwids(new Set(removingHwidsRef.current));
		setIsBulkRemoving(bulk);
		window.requestAnimationFrame(() => {
			hapticImpact("medium");
			for (const [index, { effect }] of effects.entries()) {
				effect?.start(bulk ? Math.min(index * 34, 136) : 0);
			}
		});
		for (const [index, hwid] of hwids.entries()) {
			window.setTimeout(() => finishRemoval(hwid), 850 + (bulk ? Math.min(index * 34, 136) : 0));
		}
	};

	const finishRemoval = (hwid: string) => {
		if (!removingHwidsRef.current.has(hwid)) return;
		removingHwidsRef.current.delete(hwid);
		setRenderedDevices((devices) => devices.filter((device) => device.hwid !== hwid));
		setRemovingHwids(new Set(removingHwidsRef.current));
		if (removingHwidsRef.current.size === 0) {
			setIsBulkRemoving(false);
			setDustHwids(new Set());
		}
	};

	const handleRemovalAnimationEnd = (hwid: string, event: AnimationEvent<HTMLDivElement>) => {
		if (event.target === event.currentTarget) finishRemoval(hwid);
	};

	const handleDelete = (hwid: string) => {
		setMutationError(false);
		const preparedEffects = prepareRemoval([hwid]);
		deleteDevice.mutate(hwid, {
			onSuccess: () => {
				setConfirmHwid(null);
				void startRemoval([hwid], false, preparedEffects);
			},
			onError: () => {
				cancelRemovalEffects(preparedEffects);
				hapticNotification("error");
				setMutationError(true);
			},
		});
	};

	const handleDeleteAll = () => {
		setMutationError(false);
		const hwids = renderedDevices.map((device) => device.hwid);
		const preparedEffects = prepareRemoval(hwids);
		deleteAll.mutate(undefined, {
			onSuccess: () => {
				setConfirmAll(false);
				void startRemoval(hwids, true, preparedEffects);
			},
			onError: () => {
				cancelRemovalEffects(preparedEffects);
				hapticNotification("error");
				setMutationError(true);
			},
		});
	};

	return (
		<div className={styles.page}>
			{mutationError && (
				<p className={styles.mutationError} role="alert">
					{t("devices.removeError")}
				</p>
			)}
			<FormSection
				title={t("devices.section")}
				action={
					limit !== null ? (
						<span className={styles.counter}>{formatRatio(renderedDevices.length, limit)}</span>
					) : undefined
				}
			>
				<FormSectionCard>
					{renderedDevices.length > 0 ? (
						renderedDevices.map((device, i) => {
							const isRemoving = removingHwids.has(device.hwid);
							const hasDustEffect = dustHwids.has(device.hwid);
							return (
								<div
									key={device.hwid}
									className={`${styles.devicePresence} ${
										isRemoving ? styles.devicePresenceRemoving : ""
									} ${hasDustEffect ? styles.devicePresenceDust : ""}`}
									style={
										isRemoving && isBulkRemoving
											? { animationDelay: `${Math.min(i * 34, 136)}ms` }
											: undefined
									}
									inert={isRemoving}
									aria-hidden={isRemoving}
									data-state={isRemoving ? "removing" : "idle"}
									data-effect={hasDustEffect ? "dust" : "fallback"}
									onAnimationEnd={(event) => handleRemovalAnimationEnd(device.hwid, event)}
								>
									<div
										className={styles.devicePresenceInner}
										ref={(element) => {
											if (element) rowElementsRef.current.set(device.hwid, element);
											else rowElementsRef.current.delete(device.hwid);
										}}
									>
										<DeviceRow
											device={device}
											isConfirming={confirmHwid === device.hwid && !isRemoving}
											onConfirm={() => {
												setMutationError(false);
												setConfirmHwid(device.hwid);
											}}
											onCancel={() => {
												setMutationError(false);
												setConfirmHwid(null);
											}}
											onDelete={() => handleDelete(device.hwid)}
											isDeleting={deleteDevice.isPending && confirmHwid === device.hwid}
										/>
										{i < renderedDevices.length - 1 && <div className={styles.divider} />}
									</div>
								</div>
							);
						})
					) : (
						<div className={styles.empty}>
							<svg
								width="44"
								height="44"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="1"
								strokeLinecap="round"
								strokeLinejoin="round"
								className={styles.emptyIcon}
								role="img"
								aria-label={t("devices.empty.ariaLabel")}
							>
								<rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
								<line x1="12" y1="18" x2="12.01" y2="18" />
							</svg>
							<span className={styles.emptyTitle}>{t("devices.empty.title")}</span>
							<span className={styles.emptyDesc}>{t("devices.empty.desc")}</span>
						</div>
					)}
				</FormSectionCard>
			</FormSection>

			{renderedDevices.length > 1 && !confirmAll && removingHwids.size === 0 && (
				<button
					type="button"
					className={styles.dangerBtn}
					onClick={() => {
						hapticNotification("warning");
						setMutationError(false);
						setConfirmAll(true);
					}}
				>
					{t("devices.removeAll")}
				</button>
			)}

			{confirmAll && (
				<div className={styles.confirmBar}>
					<span className={styles.confirmBarText}>
						{t("devices.confirmAll", { n: renderedDevices.length })}
					</span>
					<div className={styles.confirmBarActions}>
						<button
							type="button"
							className={styles.ghostBtn}
							onClick={() => {
								setMutationError(false);
								setConfirmAll(false);
							}}
						>
							{t("devices.cancel")}
						</button>
						<button
							type="button"
							className={styles.fillDangerBtn}
							onClick={handleDeleteAll}
							disabled={deleteAll.isPending}
						>
							{deleteAll.isPending ? t("devices.removeLoading") : t("devices.remove")}
						</button>
					</div>
				</div>
			)}
		</div>
	);
};
