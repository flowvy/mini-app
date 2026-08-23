import type { CSSProperties } from "react";
import styles from "./skeleton.module.css";

interface SkeletonProps {
	width?: string | number;
	height?: string | number;
	radius?: number;
	circle?: boolean;
	className?: string;
	style?: CSSProperties;
}

export function Skeleton({ width, height, radius, circle, className, style }: SkeletonProps) {
	const cls = [styles.skeleton, className].filter(Boolean).join(" ");
	const merged: CSSProperties = {
		width: circle ? height : width,
		height,
		borderRadius: circle ? "50%" : radius,
		...style,
	};

	return <div className={cls} style={merged} data-ui="skeleton" />;
}
