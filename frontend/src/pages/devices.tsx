import { type AnimationEvent, type FC, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { DeviceRow, getDeviceName } from "../components/devices/device-row.tsx";
import { ConfirmDialog } from "../components/ui/confirm-dialog.tsx";
import { ErrorState } from "../components/ui/error-state.tsx";
import { FormSection, FormSectionCard } from "../components/ui/form-section.tsx";
import { InlineFeedback } from "../components/ui/inline-feedback.tsx";
import { PageLoading } from "../components/ui/page-loading.tsx";
import { useDeleteAllDevices, useDeleteDevice, useDevices } from "../hooks/use-devices.ts";
import { type PreparedDustEffect, prepareDustEffect } from "../lib/dust-effect.ts";
import { formatRatio } from "../lib/format.ts";
import { hapticImpact } from "../lib/haptics.ts";
import type { DeviceData } from "../types/devices.ts";
import styles from "./devices.module.css";

type RemovalConfirmation = { kind: "device"; hwid: string } | { kind: "all" };

export const Devices: FC = () => {
	const { t } = useTranslation();
	const { devices: data, isPending, error, refetch } = useDevices();
	const deleteDevice = useDeleteDevice();
	const deleteAll = useDeleteAllDevices();
	const [confirmation, setConfirmation] = useState<RemovalConfirmation | null>(null);
	const [mutationError, setMutationError] = useState(false);
	const [renderedDevices, setRenderedDevices] = useState<DeviceData[]>([]);
	const [removingHwids, setRemovingHwids] = useState<Set<string>>(() => new Set());
	const [dustHwids, setDustHwids] = useState<Set<string>>(() => new Set());
	const [isBulkRemoving, setIsBulkRemoving] = useState(false);
	const removingHwidsRef = useRef<Set<string>>(new Set());
	const rowElementsRef = useRef<Map<string, HTMLDivElement>>(new Map());
	const confirmationTriggerRef = useRef<HTMLButtonElement | null>(null);

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
	const confirmedDevice =
		confirmation?.kind === "device"
			? renderedDevices.find((device) => device.hwid === confirmation.hwid)
			: undefined;

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
				setConfirmation(null);
				void startRemoval([hwid], false, preparedEffects);
			},
			onError: () => {
				cancelRemovalEffects(preparedEffects);
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
				setConfirmation(null);
				void startRemoval(hwids, true, preparedEffects);
			},
			onError: () => {
				cancelRemovalEffects(preparedEffects);
				setMutationError(true);
			},
		});
	};

	return (
		<div className={styles.page}>
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
											onDeleteRequest={(trigger) => {
												confirmationTriggerRef.current = trigger;
												setMutationError(false);
												setConfirmation({ kind: "device", hwid: device.hwid });
											}}
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

			{renderedDevices.length > 1 && removingHwids.size === 0 && (
				<button
					type="button"
					className={styles.dangerBtn}
					onClick={(event) => {
						confirmationTriggerRef.current = event.currentTarget;
						setMutationError(false);
						setConfirmation({ kind: "all" });
					}}
				>
					{t("devices.removeAll")}
				</button>
			)}

			<ConfirmDialog
				open={confirmation !== null}
				title={
					confirmation?.kind === "all"
						? t("devices.confirmAll", { n: renderedDevices.length })
						: t("devices.confirmDeviceTitle")
				}
				confirmLabel={
					confirmation?.kind === "all"
						? t("devices.removeAllConfirm")
						: t("devices.row.removeConfirm")
				}
				cancelLabel={t("devices.cancel")}
				telegramNativeMessage={
					mutationError
						? `${t("devices.removeError")}\n\n${
								confirmation?.kind === "all"
									? t("devices.confirmAllBody", { n: renderedDevices.length })
									: t("devices.confirmDeviceBody", {
											name: confirmedDevice
												? getDeviceName(confirmedDevice, t)
												: t("devices.fallback.unknown"),
										})
							}`
						: confirmation?.kind === "all"
							? t("devices.confirmAllBody", { n: renderedDevices.length })
							: t("devices.confirmDeviceBody", {
									name: confirmedDevice
										? getDeviceName(confirmedDevice, t)
										: t("devices.fallback.unknown"),
								})
				}
				confirmVariant="danger"
				confirmLoading={deleteDevice.isPending || deleteAll.isPending}
				alert
				returnFocusRef={confirmationTriggerRef}
				onCancel={() => {
					setMutationError(false);
					setConfirmation(null);
				}}
				onConfirm={() => {
					if (confirmation?.kind === "device") handleDelete(confirmation.hwid);
					else if (confirmation?.kind === "all") handleDeleteAll();
				}}
			>
				<p className={styles.confirmCopy}>
					{confirmation?.kind === "all"
						? t("devices.confirmAllBody", { n: renderedDevices.length })
						: t("devices.confirmDeviceBody", {
								name: confirmedDevice
									? getDeviceName(confirmedDevice, t)
									: t("devices.fallback.unknown"),
							})}
				</p>
				{mutationError && (
					<InlineFeedback attention="action">{t("devices.removeError")}</InlineFeedback>
				)}
			</ConfirmDialog>
		</div>
	);
};
