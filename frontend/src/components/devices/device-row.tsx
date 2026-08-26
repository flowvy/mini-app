import type { FC } from "react";
import { useTranslation } from "react-i18next";
import { formatShortDate } from "../../lib/format.ts";
import type { DeviceData } from "../../types/devices.ts";
import styles from "./device-row.module.css";
import { getPlatformKind, PlatformIcon } from "./platform-icon.tsx";

interface DeviceRowProps {
	device: DeviceData;
	onDeleteRequest: (trigger: HTMLButtonElement) => void;
}

const FALLBACK_NAMES: Record<string, string> = {
	android: "devices.fallback.android",
	ios: "devices.fallback.ios",
	macos: "devices.fallback.macos",
	windows: "devices.fallback.windows",
	linux: "devices.fallback.linux",
};

const PLATFORM_LABELS: Record<string, string> = {
	android: "devices.platform.android",
	ios: "devices.platform.ios",
	macos: "devices.platform.macos",
	windows: "devices.platform.windows",
	linux: "devices.platform.linux",
};

export function getDeviceName(device: DeviceData, t: (key: string) => string): string {
	if (device.deviceModel) return device.deviceModel;
	return t(FALLBACK_NAMES[device.platform?.toLowerCase() ?? ""] ?? "devices.fallback.unknown");
}

function getPlatformName(platform: string | null, t: (key: string) => string): string {
	const kind = getPlatformKind(platform);
	if (kind) return t(PLATFORM_LABELS[kind]);
	return platform?.trim() || t("devices.platform.unknown");
}

function isoTimestamp(unix: number): string {
	return new Date(unix * 1000).toISOString();
}

export const DeviceRow: FC<DeviceRowProps> = ({ device, onDeleteRequest }) => {
	const { t } = useTranslation();
	const missing = t("devices.row.notReported");
	return (
		<div className={styles.row}>
			<div className={styles.iconWrap}>
				<PlatformIcon platform={device.platform} />
			</div>
			<div className={styles.info}>
				<span className={styles.name}>{getDeviceName(device, t)}</span>
				<div className={styles.meta}>
					<div className={`${styles.metaLine} ${styles.dateLine}`}>
						<span className={styles.metaItem}>
							<span className={styles.metaLabel}>{t("devices.row.added")}</span>
							<time dateTime={isoTimestamp(device.createdAt)}>
								{formatShortDate(device.createdAt)}
							</time>
						</span>
						<span className={styles.metaItem}>
							<span className={styles.metaLabel}>{t("devices.row.updated")}</span>
							<time dateTime={isoTimestamp(device.updatedAt)}>
								{formatShortDate(device.updatedAt)}
							</time>
						</span>
					</div>
					<div className={styles.metaLine}>
						<span className={styles.metaItem}>{getPlatformName(device.platform, t)}</span>
						<span className={styles.metaItem}>
							<span className={styles.metaLabel}>{t("devices.row.ip")}</span>
							<span className={styles.mono}>{device.requestIp || missing}</span>
						</span>
					</div>
				</div>
			</div>
			<button
				type="button"
				className={styles.iconBtn}
				onClick={(event) => onDeleteRequest(event.currentTarget)}
			>
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
					aria-label={t("devices.row.deleteLabel")}
				>
					<polyline points="3 6 5 6 21 6" />
					<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
				</svg>
			</button>
		</div>
	);
};
