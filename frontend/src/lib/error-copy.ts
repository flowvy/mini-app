import i18n from "../i18n";
import { ApiError } from "./api.ts";

const ERROR_CODE_KEYS: Record<string, string> = {
	account_disabled: "common.apiError.accountDisabled",
	invite_required: "onboarding.error.inviteRequired",
	invalid_invite: "onboarding.error.invalidInvite",
	invite_rate_limited: "onboarding.error.rateLimited",
	registration_failed: "onboarding.error.unavailable",
	registration_unavailable: "onboarding.error.unavailable",
};

/** Resolve stable machine error codes to locale copy without exposing transport diagnostics. */
export function getLocalizedError(error: unknown, fallbackKey: string): string {
	if (error instanceof ApiError && error.code) {
		const key = ERROR_CODE_KEYS[error.code];
		if (key) return i18n.t(key);
	}
	return i18n.t(fallbackKey);
}
