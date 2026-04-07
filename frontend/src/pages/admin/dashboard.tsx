import { useState } from "react";
import type { FC } from "react";
import { useTranslation } from "react-i18next";
import { SegmentedControl } from "../../components/ui/segmented-control.tsx";
import { useDashboard } from "../../hooks/use-dashboard.ts";
import { BotContent } from "./dashboard-bot.tsx";
import { VpnContent } from "./dashboard-vpn.tsx";
import styles from "./dashboard.module.css";

type Tab = "vpn" | "bot";

const TAB_OPTIONS = [
	{ key: "vpn", label: "admin.dashboard.tab.vpn" },
	{ key: "bot", label: "admin.dashboard.tab.bot" },
];

export const AdminDashboard: FC = () => {
	const { t } = useTranslation();
	const [tab, setTab] = useState<Tab>("vpn");
	const { data, isPending, error } = useDashboard();

	if (isPending) return <div className={styles.loading}>{t("admin.dashboard.loading")}</div>;
	if (error || !data) return <div className={styles.error}>{t("admin.dashboard.error")}</div>;

	const translatedOptions = TAB_OPTIONS.map((o) => ({ key: o.key, label: t(o.label) }));

	return (
		<div className={styles.page}>
			<SegmentedControl
				options={translatedOptions}
				value={tab}
				onChange={(k) => setTab(k as Tab)}
			/>
			{tab === "vpn" ? <VpnContent data={data} t={t} /> : <BotContent data={data} t={t} />}
		</div>
	);
};
