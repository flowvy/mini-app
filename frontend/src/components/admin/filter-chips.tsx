import type { FC } from "react";
import { useTranslation } from "react-i18next";
import styles from "./filter-chips.module.css";

export type FilterKey = "ALL" | "ACTIVE" | "DISABLED" | "LIMITED" | "EXPIRED" | "ONLINE";

export const FILTER_KEYS: readonly FilterKey[] = [
	"ALL",
	"ACTIVE",
	"DISABLED",
	"LIMITED",
	"EXPIRED",
	"ONLINE",
] as const;

const LABEL_KEY: Record<FilterKey, string> = {
	ALL: "admin.users.filter.all",
	ACTIVE: "admin.userStatus.active",
	DISABLED: "admin.userStatus.disabled",
	LIMITED: "admin.userStatus.limited",
	EXPIRED: "admin.userStatus.expired",
	ONLINE: "admin.users.filter.online",
};

interface FilterChipsProps {
	active: FilterKey;
	onChange: (key: FilterKey) => void;
	counts: Record<FilterKey, number>;
}

export const FilterChips: FC<FilterChipsProps> = ({ active, onChange, counts }) => {
	const { t } = useTranslation();

	return (
		<fieldset className={styles.container} aria-label={t("admin.users.filter.label")}>
			{FILTER_KEYS.map((key) => {
				const isActive = key === active;
				return (
					<button
						type="button"
						key={key}
						className={`${styles.chip} ${isActive ? styles.active : ""}`}
						onClick={() => onChange(key)}
						aria-pressed={isActive}
					>
						<span className={styles.label}>{t(LABEL_KEY[key])}</span>
						<span className={styles.count}>{counts[key]}</span>
					</button>
				);
			})}
		</fieldset>
	);
};
