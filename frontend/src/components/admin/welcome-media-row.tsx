/** Presentational media file row — displays current media and action buttons. */
import { Film, Image } from "lucide-react";
import { type FC, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ActionBtn } from "../ui/action-btn.tsx";
import ms from "./welcome-media.module.css";

const ACCEPT = ".jpg,.jpeg,.png,.webp,.gif,.mp4";

interface WelcomeMediaRowProps {
	fileName: string;
	mediaType: string;
	isDefault: boolean;
	uploading: boolean;
	onPickFile: (file: File) => void;
	onReset: () => void;
}

export const WelcomeMediaRow: FC<WelcomeMediaRowProps> = ({
	fileName,
	mediaType,
	isDefault,
	uploading,
	onPickFile,
	onReset,
}) => {
	const { t } = useTranslation();
	const fileRef = useRef<HTMLInputElement>(null);
	const MediaIcon = mediaType === "photo" ? Image : Film;

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (!file) return;
		e.target.value = "";
		onPickFile(file);
	};

	return (
		<>
			<div className={ms.row}>
				<MediaIcon size={16} className={ms.icon} />
				<div className={ms.info}>
					<span className={ms.fileName}>{fileName}</span>
					<span className={ms.fileType}>
						{mediaType === "photo"
							? t("settings.welcome.mediaType.photo")
							: t("settings.welcome.mediaType.animation")}
					</span>
				</div>
				<div className={ms.actions}>
					<ActionBtn
						variant="action"
						size="sm"
						loading={uploading}
						onClick={() => fileRef.current?.click()}
					>
						{t("settings.welcome.mediaChange")}
					</ActionBtn>
					{!isDefault && (
						<ActionBtn variant="dangerOutline" size="sm" disabled={uploading} onClick={onReset}>
							{t("settings.welcome.mediaReset")}
						</ActionBtn>
					)}
				</div>
			</div>
			<input
				ref={fileRef}
				type="file"
				accept={ACCEPT}
				className={ms.hiddenInput}
				onChange={handleChange}
			/>
		</>
	);
};
