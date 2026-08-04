import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOnboarding } from "../hooks/use-onboarding.ts";
import { dismissKeyboardOnEnter } from "../lib/keyboard.ts";
import styles from "./onboarding-screen.module.css";
import { AppLogo } from "./ui/app-logo.tsx";
import { InlineFeedback } from "./ui/inline-feedback.tsx";
import { LoadErrorState } from "./ui/load-error-state.tsx";
import { SpinnerIcon } from "./ui/spinner-icon.tsx";

interface OnboardingScreenProps {
	initialState: "open" | "invite_required";
}

export function OnboardingScreen({ initialState }: OnboardingScreenProps) {
	const { t } = useTranslation();
	const [code, setCode] = useState("");
	const autoRedeemStarted = useRef(false);
	const { statusQuery, registerMutation, redeemMutation, redeemLaunchMutation } = useOnboarding();
	const state = statusQuery.data?.state === "registered" ? initialState : statusQuery.data?.state;
	const effectiveState = state ?? initialState;
	const appName = statusQuery.data?.appName || t("common.appName");
	const isPending =
		registerMutation.isPending || redeemMutation.isPending || redeemLaunchMutation.isPending;
	const error = registerMutation.error ?? redeemMutation.error ?? redeemLaunchMutation.error;

	useEffect(() => {
		if (
			!statusQuery.isSuccess ||
			effectiveState !== "invite_required" ||
			!statusQuery.data.launchInviteAvailable ||
			autoRedeemStarted.current
		) {
			return;
		}
		autoRedeemStarted.current = true;
		redeemLaunchMutation.mutate();
	}, [effectiveState, redeemLaunchMutation, statusQuery.data, statusQuery.isSuccess]);

	const submit = () => {
		registerMutation.reset();
		redeemMutation.reset();
		redeemLaunchMutation.reset();
		if (effectiveState === "invite_required") {
			const normalized = code.trim();
			if (!normalized) return;
			redeemMutation.mutate(normalized);
			return;
		}
		registerMutation.mutate();
	};
	const submitCodeOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
		dismissKeyboardOnEnter(event);
		submit();
	};

	if (statusQuery.isPending) {
		return (
			<div className="fv-auth-screen">
				<SpinnerIcon size={24} color="var(--v2-text-secondary)" />
			</div>
		);
	}
	if (statusQuery.isError) {
		return <LoadErrorState onRetry={() => statusQuery.refetch()} />;
	}

	return (
		<main className={styles.screen}>
			<section className={styles.card} aria-labelledby="onboarding-title">
				<AppLogo logoUrl={statusQuery.data?.logoUrl ?? null} size={44} />
				<div className={styles.copy}>
					<p className={styles.eyebrow}>{appName}</p>
					<h1 id="onboarding-title" className={styles.title}>
						{effectiveState === "invite_required"
							? t("onboarding.inviteTitle")
							: t("onboarding.openTitle")}
					</h1>
					<p className={styles.description}>
						{effectiveState === "invite_required"
							? t("onboarding.inviteDescription")
							: t("onboarding.openDescription")}
					</p>
				</div>

				<form
					className={styles.form}
					onSubmit={(event) => {
						event.preventDefault();
						submit();
					}}
				>
					{effectiveState === "invite_required" && (
						<label className={styles.field}>
							<span>{t("onboarding.codeLabel")}</span>
							<input
								value={code}
								onChange={(event) => setCode(event.target.value)}
								onKeyDown={submitCodeOnEnter}
								placeholder={t("onboarding.codePlaceholder")}
								autoCapitalize="characters"
								autoCorrect="off"
								spellCheck={false}
								enterKeyHint="done"
								className={styles.input}
							/>
						</label>
					)}
					{error && <InlineFeedback>{error.message}</InlineFeedback>}
					<button
						type="submit"
						className={styles.submit}
						disabled={isPending || (effectiveState === "invite_required" && !code.trim())}
					>
						{isPending ? (
							<SpinnerIcon size={16} />
						) : effectiveState === "invite_required" ? (
							t("onboarding.redeem")
						) : (
							t("onboarding.register")
						)}
					</button>
				</form>
			</section>
		</main>
	);
}
