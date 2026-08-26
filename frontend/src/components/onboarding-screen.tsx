import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOnboarding } from "../hooks/use-onboarding.ts";
import { getLocalizedError } from "../lib/error-copy.ts";
import { operatorFormattedText, operatorText } from "../lib/operator-content.ts";
import { FormattedText } from "./content/formatted-text.tsx";
import { EntryTransition } from "./entry-transition.tsx";
import styles from "./onboarding-screen.module.css";
import { AppLogo } from "./ui/app-logo.tsx";
import { ErrorState } from "./ui/error-state.tsx";
import { FormSurfaceBody } from "./ui/form-section.tsx";
import { InlineFeedback } from "./ui/inline-feedback.tsx";
import { LaunchSkeleton } from "./ui/page-skeleton.tsx";
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
	const content = statusQuery.data?.content;
	const context = { appName, app_name: appName };
	const isPending =
		registerMutation.isPending || redeemMutation.isPending || redeemLaunchMutation.isPending;
	const error = registerMutation.error ?? redeemMutation.error ?? redeemLaunchMutation.error;
	const autoRedeemInProgress =
		statusQuery.isSuccess &&
		statusQuery.data.launchInviteAvailable &&
		!redeemLaunchMutation.isError;

	useEffect(() => {
		document.title = appName;
	}, [appName]);

	useEffect(() => {
		if (
			!statusQuery.isSuccess ||
			!statusQuery.data.launchInviteAvailable ||
			autoRedeemStarted.current
		) {
			return;
		}
		autoRedeemStarted.current = true;
		redeemLaunchMutation.mutate();
	}, [redeemLaunchMutation, statusQuery.data, statusQuery.isSuccess]);

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
	if (statusQuery.isPending) {
		return <LaunchSkeleton />;
	}
	if (autoRedeemInProgress) {
		return (
			<EntryTransition appName={statusQuery.data?.appName} logoUrl={statusQuery.data?.logoUrl} />
		);
	}
	if (statusQuery.isError) {
		return <ErrorState onAction={() => statusQuery.refetch()} />;
	}

	return (
		<main className={styles.screen}>
			<section className={styles.card} aria-labelledby="onboarding-title" data-ui="onboarding-card">
				<AppLogo logoUrl={statusQuery.data?.logoUrl ?? null} size={44} />
				<div className={styles.copy}>
					<p className={styles.eyebrow}>{appName}</p>
					<h1 id="onboarding-title" className={styles.title}>
						{effectiveState === "invite_required"
							? operatorText(content, "onboardingInviteTitle", t("onboarding.inviteTitle"), context)
							: operatorText(content, "onboardingOpenTitle", t("onboarding.openTitle"), context)}
					</h1>
					<FormattedText className={styles.description}>
						{effectiveState === "invite_required"
							? operatorFormattedText(
									content,
									"onboardingInviteDescription",
									t("onboarding.inviteDescription"),
									context,
								)
							: operatorFormattedText(
									content,
									"onboardingOpenDescription",
									t("onboarding.openDescription"),
									context,
								)}
					</FormattedText>
				</div>

				<form
					className={styles.form}
					onSubmit={(event) => {
						event.preventDefault();
						submit();
					}}
				>
					<FormSurfaceBody className={styles.formBody} dataUi="onboarding-form-body">
						{effectiveState === "invite_required" && (
							<input
								value={code}
								onChange={(event) => setCode(event.target.value)}
								aria-label={t("onboarding.codeLabel")}
								placeholder={t("onboarding.codePlaceholder")}
								autoCapitalize="characters"
								autoCorrect="off"
								spellCheck={false}
								enterKeyHint="done"
								className={styles.input}
							/>
						)}
						{error && (
							<InlineFeedback attention="action">
								{getLocalizedError(error, "onboarding.error.generic")}
							</InlineFeedback>
						)}
						<button
							type="submit"
							className={styles.submit}
							disabled={isPending || (effectiveState === "invite_required" && !code.trim())}
						>
							{isPending ? (
								<SpinnerIcon size={16} />
							) : effectiveState === "invite_required" ? (
								operatorText(content, "onboardingRedeemAction", t("onboarding.redeem"), context)
							) : (
								operatorText(content, "onboardingRegisterAction", t("onboarding.register"), context)
							)}
						</button>
					</FormSurfaceBody>
				</form>
			</section>
		</main>
	);
}
