import { useNavigate } from "@tanstack/react-router";
import {
	BadgeDollarSign,
	Bot,
	Contact,
	MousePointerClick,
	Send,
	UserPlus,
	UserRoundPlus,
} from "lucide-react";
import type { FC, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
	SettingsDivider,
	SettingsNavRow,
	SettingsSection,
} from "../../components/admin/settings-surface.tsx";
import styles from "./settings.module.css";

interface MessageRowProps {
	icon: ReactNode;
	labelKey: string;
	destinationKey: string;
	message: string;
}

export const AdminCommunicationSettings: FC = () => {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const openMessage = (message: string) =>
		navigate({ to: "/admin/settings/content", search: { message } });
	const messageRow = ({ icon, labelKey, destinationKey, message }: MessageRowProps) => (
		<SettingsNavRow
			icon={icon}
			label={t(labelKey)}
			description={t(destinationKey)}
			onClick={() => openMessage(message)}
		/>
	);

	return (
		<div className={styles.page}>
			<p className={styles.screenIntro}>{t("settings.communication.intro")}</p>
			<SettingsSection title={t("settings.communication.telegram")}>
				<SettingsNavRow
					icon={<Bot size={17} strokeWidth={1.8} aria-hidden="true" />}
					label={t("settings.miniApp.welcomeRow")}
					description={t("settings.communication.welcomeDestination")}
					onClick={() => navigate({ to: "/admin/settings/welcome" })}
				/>
				<SettingsDivider />
				{messageRow({
					icon: <Send size={17} strokeWidth={1.8} aria-hidden="true" />,
					labelKey: "settings.content.messages.inviteShare",
					destinationKey: "settings.content.destinations.inviteShare",
					message: "inviteShare",
				})}
			</SettingsSection>

			<SettingsSection title={t("settings.communication.registration")}>
				{messageRow({
					icon: <UserRoundPlus size={17} strokeWidth={1.8} aria-hidden="true" />,
					labelKey: "settings.content.messages.inviteRegistration",
					destinationKey: "settings.content.destinations.inviteRegistration",
					message: "inviteRegistration",
				})}
				<SettingsDivider />
				{messageRow({
					icon: <UserPlus size={17} strokeWidth={1.8} aria-hidden="true" />,
					labelKey: "settings.content.messages.openRegistration",
					destinationKey: "settings.content.destinations.openRegistration",
					message: "openRegistration",
				})}
			</SettingsSection>

			<SettingsSection title={t("settings.communication.home")}>
				{messageRow({
					icon: <Contact size={17} strokeWidth={1.8} aria-hidden="true" />,
					labelKey: "settings.content.messages.inviteCard",
					destinationKey: "settings.content.destinations.inviteCard",
					message: "inviteCard",
				})}
				<SettingsDivider />
				{messageRow({
					icon: <BadgeDollarSign size={17} strokeWidth={1.8} aria-hidden="true" />,
					labelKey: "settings.content.messages.sponsorNoAccess",
					destinationKey: "settings.content.destinations.sponsorNoAccess",
					message: "sponsorNoAccess",
				})}
				<SettingsDivider />
				{messageRow({
					icon: <BadgeDollarSign size={17} strokeWidth={1.8} aria-hidden="true" />,
					labelKey: "settings.content.messages.sponsorBaseAccess",
					destinationKey: "settings.content.destinations.sponsorBaseAccess",
					message: "sponsorBaseAccess",
				})}
				<SettingsDivider />
				{messageRow({
					icon: <MousePointerClick size={17} strokeWidth={1.8} aria-hidden="true" />,
					labelKey: "settings.content.messages.sponsorAction",
					destinationKey: "settings.content.destinations.sponsorAction",
					message: "sponsorAction",
				})}
			</SettingsSection>
		</div>
	);
};
