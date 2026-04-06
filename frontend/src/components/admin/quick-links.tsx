import { ArrowLeft, Check } from "lucide-react";
/**
 * Quick Links sub-screen — support URL, renew URL, save.
 */
import { type FC, useCallback, useEffect, useState } from "react";
import { useUpdateSettings } from "../../hooks/use-admin-settings.ts";
import styles from "../../pages/admin/settings.module.css";
import type { AdminSettings } from "../../types/admin-settings.ts";
import { ActionBtn } from "../ui/action-btn.tsx";
import { ConfirmDialog } from "../ui/confirm-dialog.tsx";
import { InputField } from "../ui/input-field.tsx";

interface QuickLinksProps {
	settings: AdminSettings;
	onBack: () => void;
}

export const QuickLinks: FC<QuickLinksProps> = ({ settings, onBack }) => {
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
		<div className={styles.page}>
			<div className={styles.subHeader}>
				<button type="button" className={styles.backBtn} onClick={handleBack}>
					<ArrowLeft size={16} />
				</button>
				<h1 className={styles.headerTitle}>Quick Links</h1>
			</div>

			<div className={styles.sectionBody}>
				<div className={styles.inputRow}>
					<div className={styles.inputRowLabels}>
						<span className={styles.rowLabel}>Support</span>
						<span className={styles.rowDesc}>Link shown to users on Support page</span>
					</div>
					<InputField
						value={supportUrl}
						onChange={(v) => {
							setSupportUrl(v);
							setSaved(false);
						}}
						placeholder="https://t.me/support"
					/>
				</div>

				<div className={styles.inputRow}>
					<div className={styles.inputRowLabels}>
						<span className={styles.rowLabel}>Renew</span>
						<span className={styles.rowDesc}>Subscription renewal link</span>
					</div>
					<InputField
						value={renewUrl}
						onChange={(v) => {
							setRenewUrl(v);
							setSaved(false);
						}}
						placeholder="https://example.com/renew"
					/>
				</div>

				{(dirty || saved) && (
					<div className={styles.saveBar}>
						{saved && (
							<span className={styles.savedText}>
								<Check size={12} /> Saved
							</span>
						)}
						{dirty && !saved && (
							<ActionBtn onClick={handleSave} loading={updateMutation.isPending} size="md">
								Save
							</ActionBtn>
						)}
					</div>
				)}
			</div>

			<ConfirmDialog
				open={showDiscard}
				title="Discard changes?"
				confirmLabel="Discard"
				cancelLabel="Keep editing"
				onConfirm={onBack}
				onCancel={() => setShowDiscard(false)}
			>
				<p>You have unsaved changes that will be lost.</p>
			</ConfirmDialog>
		</div>
	);
};
