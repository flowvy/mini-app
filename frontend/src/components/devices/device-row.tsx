import { Loader2 } from "lucide-react";
import type { FC } from "react";
import { formatShortDate } from "../../lib/format.ts";
import type { DeviceData } from "../../types/devices.ts";
import styles from "./device-row.module.css";
import { PlatformIcon } from "./platform-icon.tsx";

interface DeviceRowProps {
	device: DeviceData;
	isConfirming: boolean;
	onConfirm: () => void;
	onDelete: () => void;
	isDeleting: boolean;
}

const FALLBACK_NAMES: Record<string, string> = {
	android: "Android Device",
	ios: "iOS Device",
	macos: "Mac",
	windows: "Windows PC",
	linux: "Linux",
};

function getDeviceName(device: DeviceData): string {
	if (device.deviceModel) return device.deviceModel;
	return FALLBACK_NAMES[device.platform?.toLowerCase() ?? ""] ?? "Unknown device";
}

export const DeviceRow: FC<DeviceRowProps> = ({
	device,
	isConfirming,
	onConfirm,
	onDelete,
	isDeleting,
}) => {
	return (
		<div className={styles.row}>
			<div className={styles.iconWrap}>
				<PlatformIcon platform={device.platform} />
			</div>
			<div className={styles.info}>
				<span className={styles.name}>{getDeviceName(device)}</span>
				<span className={styles.meta}>{device.osVersion || device.platform}</span>
				<span className={styles.date}>Added {formatShortDate(device.createdAt)}</span>
			</div>
			{isConfirming ? (
				<button
					type="button"
					className={styles.removeConfirmBtn}
					onClick={onDelete}
					disabled={isDeleting}
				>
					{isDeleting ? <Loader2 size={12} className={styles.spinner} /> : "Remove"}
				</button>
			) : (
				<button type="button" className={styles.iconBtn} onClick={onConfirm}>
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.8"
						strokeLinecap="round"
						strokeLinejoin="round"
						role="img"
						aria-label="Delete device"
					>
						<polyline points="3 6 5 6 21 6" />
						<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
					</svg>
				</button>
			)}
		</div>
	);
};
