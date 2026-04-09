interface SpinnerIconProps {
	size?: number;
	color?: string;
}

export function SpinnerIcon({ size = 20, color = "currentColor" }: SpinnerIconProps) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke={color}
			strokeWidth="2.5"
			strokeLinecap="round"
			style={{ animation: "var(--fv-anim-spin) 0.8s linear infinite" }}
			aria-hidden="true"
		>
			<path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4" />
		</svg>
	);
}
