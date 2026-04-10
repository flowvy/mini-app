/** Quick Links sub-screen — support URL, renew URL, save. */
import { ArrowLeft } from "lucide-react";
import { type FC, useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUpdateSettings } from "../../hooks/use-admin-settings.ts";
import ss from "../../pages/admin/settings.module.css";
import type { AdminSettings } from "../../types/admin-settings.ts";
import { ConfirmDialog } from "../ui/confirm-dialog.tsx";
import { FormSaveButton } from "../ui/form-save-button.tsx";
import {
	FormInlineInput,
	FormRow,
	FormRowSeparator,
	FormSectionCard,
	FormSectionFooter,
	FormSectionHeader,
} from "../ui/form-section.tsx";

interface QuickLinksProps {
	settings: AdminSettings;
	onBack: () => void;
}

export const QuickLinks: FC<QuickLinksProps> = ({ settings, onBack }) => {
	const { t } = useTranslation();
	const [supportUrl, setSupportUrl] = useState(settings.supportUrl ?? "");
	const [renewUrl, setRenewUrl] = useState(settings.renewUrl ?? "");
	const [saved, setSaved] = useState(false);
	const [showDiscard, setShowDiscard] = useState(false);

	const updateMutation = useUpdateSettings();

	const initSupport = settings.supportUrl ?? "";
	const initRenew = settings.renewUrl ?? "";
	const dirty = supportUrl !== initSupport || renewUrl !== initRenew;

	useEffect(() => {
		if (saved) {
			const timer = setTimeout(() => setSaved(false), 2000);
			return () => clearTimeout(timer);
		}
	}, [saved]);

	const handleBack = useCallback(() => {
		if (dirty) {
			setShowDiscard(true);
		} else {
			onBack();
		}
	}, [dirty, onBack]);

	const handleSave = async () => {
		await updateMutation.mutateAsync({
			supportUrl: supportUrl || null,
			renewUrl: renewUrl || null,
		});
		setSaved(true);
	};

	return (
		<div className={ss.page}>
			<div className={ss.subHeader}>
				<button type="button" className={ss.backBtn} onClick={handleBack}>
					<ArrowLeft size={16} />
				</button>
				<h1 className={ss.headerTitle}>{t("settings.links.title")}</h1>
			</div>

			<FormSectionHeader>{t("settings.links.linksSection")}</FormSectionHeader>
			<FormSectionCard>
				<FormRow label={t("settings.links.supportLabel")}>
					<FormInlineInput
						value={supportUrl}
						onChange={(v) => {
							setSupportUrl(v);
							setSaved(false);
						}}
						placeholder={t("settings.links.supportPlaceholder")}
						mono
					/>
				</FormRow>
				<FormRowSeparator />
				<FormRow label={t("settings.links.renewLabel")}>
					<FormInlineInput
						value={renewUrl}
						onChange={(v) => {
							setRenewUrl(v);
							setSaved(false);
						}}
						placeholder={t("settings.links.renewPlaceholder")}
						mono
					/>
				</FormRow>
			</FormSectionCard>
			<FormSectionFooter>{t("settings.links.linksHint")}</FormSectionFooter>

			<FormSaveButton
				dirty={dirty && !saved}
				loading={updateMutation.isPending}
				onSave={handleSave}
			/>

			<ConfirmDialog
				open={showDiscard}
				title={t("settings.links.discardTitle")}
				confirmLabel={t("settings.links.discardConfirm")}
				cancelLabel={t("settings.links.discardCancel")}
				onConfirm={onBack}
				onCancel={() => setShowDiscard(false)}
			>
				<p>{t("settings.links.discardBody")}</p>
			</ConfirmDialog>
		</div>
	);
};
