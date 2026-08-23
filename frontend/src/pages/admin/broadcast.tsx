import { Megaphone } from "lucide-react";
import type { FC } from "react";
import { useTranslation } from "react-i18next";
import { ComingSoon } from "../../components/ui/coming-soon.tsx";

export const AdminBroadcast: FC = () => {
	const { t } = useTranslation();
	return (
		<ComingSoon
			id="broadcast"
			icon={Megaphone}
			title={t("common.header.broadcast")}
			description={t("admin.broadcast.comingSoon")}
		/>
	);
};
