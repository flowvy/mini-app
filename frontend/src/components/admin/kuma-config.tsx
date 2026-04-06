import { ArrowLeft, Check } from "lucide-react";
/**
 * Kuma configuration sub-screen — URL, slug, connection test, save.
 */
import { type FC, useCallback, useEffect, useState } from "react";
import { useTestKuma, useUpdateSettings } from "../../hooks/use-admin-settings.ts";
import styles from "../../pages/admin/settings.module.css";
import type { AdminSettings } from "../../types/admin-settings.ts";
import { ActionBtn } from "../ui/action-btn.tsx";
import { ConfirmDialog } from "../ui/confirm-dialog.tsx";
import { InputField } from "../ui/input-field.tsx";

interface KumaConfigProps {
	settings: AdminSettings;
	onBack: () => void;
}

export const KumaConfig: FC<KumaConfigProps> = ({ settings, onBack }) => {
	const [url, setUrl] = useState(settings.kumaUrl ?? "");
	const [slug, setSlug] = useState(settings.kumaSlug ?? "");
	const [saved, setSaved] = useState(false);
	const [showDiscard, setShowDiscard] = useState(false);

	const updateMutation = useUpdateSettings();
	const testMutation = useTestKuma();

	const initUrl = settings.kumaUrl ?? "";
	const initSlug = settings.kumaSlug ?? "";
	const dirty = url !== initUrl || slug !== initSlug;

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
			kumaUrl: url || null,
			kumaSlug: slug || null,
		});
		setSaved(true);
	};

	const connStatus = testMutation.data;
	const connColor = connStatus?.ok
		? "var(--v2-text-positive)"
		: connStatus?.error
			? "var(--v2-text-negative)"
			: "var(--v2-text-secondary)";
	const connText = connStatus?.ok
		? "Connected"
		: connStatus?.error
			? connStatus.error
			: "Not tested";

	return (
		<div className={styles.page}>
			<div className={styles.subHeader}>
				<button type="button" className={styles.backBtn} onClick={handleBack}>
					<ArrowLeft size={16} />
				</button>
				<h1 className={styles.headerTitle}>Uptime Kuma</h1>
			</div>

			<div className={styles.sectionBody}>
				<div className={styles.inputRow}>
					<div className={styles.inputRowLabels}>
						<span className={styles.rowLabel}>URL</span>
						<span className={styles.rowDesc}>Status page address</span>
					</div>
					<InputField
						value={url}
						onChange={(v) => {
							setUrl(v);
							setSaved(false);
						}}
						placeholder="https://status.example.com"
					/>
				</div>

				<div className={styles.inputRow}>
					<div className={styles.inputRowLabels}>
						<span className={styles.rowLabel}>Slug</span>
						<span className={styles.rowDesc}>Status page identifier</span>
					</div>
					<InputField
						value={slug}
						onChange={(v) => {
							setSlug(v);
							setSaved(false);
						}}
						placeholder="service"
					/>
				</div>

				<div className={styles.row}>
					<div className={styles.rowLeft}>
						<span className={styles.rowLabel}>Connection</span>
						<span className={styles.statusText} style={{ color: connColor }}>
							{connText}
						</span>
					</div>
					<ActionBtn
						onClick={() => testMutation.mutate()}
						loading={testMutation.isPending}
						variant="action"
						size="sm"
					>
						Test
					</ActionBtn>
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
								Save changes
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
