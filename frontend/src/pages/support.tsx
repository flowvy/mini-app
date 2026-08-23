import { HelpCircle } from "lucide-react";
import type { FC } from "react";
import { useTranslation } from "react-i18next";
import { ComingSoon } from "../components/ui/coming-soon.tsx";

export const Support: FC = () => {
	const { t } = useTranslation();
	return (
		<ComingSoon
			id="support"
			icon={HelpCircle}
			title={t("support.title")}
			description={t("support.comingSoon")}
		/>
	);
};
