import { Loader2 } from "lucide-react";
import { type FC, useState } from "react";
import { useTranslation } from "react-i18next";
import { DeviceRow } from "../components/devices/device-row.tsx";
import { useDeleteAllDevices, useDeleteDevice, useDevices } from "../hooks/use-devices.ts";
import { hapticNotification } from "../lib/haptics.ts";
import styles from "./devices.module.css";

export const Devices: FC = () => {
	const { t } = useTranslation();
	const { devices: data, isPending, error } = useDevices();
	const deleteDevice = useDeleteDevice();
	const deleteAll = useDeleteAllDevices();
	const [confirmHwid, setConfirmHwid] = useState<string | null>(null);
	const [confirmAll, setConfirmAll] = useState(false);

	if (isPending) {
		return (
			<div className={styles.empty}>
				<Loader2 size={24} className={styles.emptyIcon} />
			</div>
		);
	}

	if (error) {
		return (
			<div className={styles.empty}>
				<span className={styles.emptyTitle}>{t("devices.error")}</span>
			</div>
		);
	}

	const devices = data?.devices ?? [];
	const limit = data?.limit ?? null;

	const handleDelete = (hwid: string) => {
		deleteDevice.mutate(hwid, {
			onSuccess: () => hapticNotification("success"),
			onSettled: () => setConfirmHwid(null),
		});
	};

	const handleDeleteAll = () => {
		deleteAll.mutate(undefined, {
			onSuccess: () => hapticNotification("success"),
			onSettled: () => setConfirmAll(false),
		});
	};

	return (
		<div className={styles.page}>
			{limit !== null && (
				<div className={styles.counter}>
					<span className={styles.counterUsed}>{devices.length}</span>
					<span className={styles.counterSep}>/</span>
					<span className={styles.counterTotal}>{limit}</span>
				</div>
			)}

			<p className={styles.pageHint}>{t("devices.hint")}</p>

			{devices.length > 0 ? (
				<div className={styles.sectionBody}>
					{devices.map((device, i) => (
						<div key={device.hwid}>
							<DeviceRow
								device={device}
								isConfirming={confirmHwid === device.hwid}
								onConfirm={() => setConfirmHwid(device.hwid)}
								onDelete={() => handleDelete(device.hwid)}
								isDeleting={deleteDevice.isPending && confirmHwid === device.hwid}
							/>
							{i < devices.length - 1 && <div className={styles.divider} />}
						</div>
					))}
				</div>
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

			{devices.length > 1 && !confirmAll && (
				<button
					type="button"
					className={styles.dangerBtn}
					onClick={() => {
						hapticNotification("warning");
						setConfirmAll(true);
					}}
				>
					{t("devices.removeAll")}
				</button>
			)}

			{confirmAll && (
				<div className={styles.confirmBar}>
					<span className={styles.confirmBarText}>
						{t("devices.confirmAll", { n: devices.length })}
					</span>
					<div className={styles.confirmBarActions}>
						<button type="button" className={styles.ghostBtn} onClick={() => setConfirmAll(false)}>
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
