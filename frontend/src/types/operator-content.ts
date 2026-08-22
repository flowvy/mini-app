export interface OperatorContent {
	welcomeText?: string | null;
	welcomeButtonText?: string | null;
	botInviteRequired?: string | null;
	onboardingInviteTitle?: string | null;
	onboardingInviteDescription?: string | null;
	onboardingOpenTitle?: string | null;
	onboardingOpenDescription?: string | null;
	onboardingRedeemAction?: string | null;
	onboardingRegisterAction?: string | null;
	inviteTitle?: string | null;
	inviteDescription?: string | null;
	inviteShareText?: string | null;
	sponsorNoAccessTitle?: string | null;
	sponsorNoAccessDescription?: string | null;
	sponsorBaseAccessTitle?: string | null;
	sponsorBaseAccessDescription?: string | null;
	sponsorChooseAction?: string | null;
}

export type OperatorContentLocales = Record<string, OperatorContent>;
