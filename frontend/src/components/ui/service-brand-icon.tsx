import type { SVGProps } from "react";

interface ServiceBrandIconProps extends Omit<SVGProps<SVGSVGElement>, "height" | "width"> {
	size?: number;
}

function iconProps(size: number, props: Omit<ServiceBrandIconProps, "size">) {
	return {
		width: size,
		height: size,
		focusable: false,
		...props,
	};
}

/** Adapted from louislam/uptime-kuma public/icon.svg (MIT). */
export function UptimeKumaIcon({ size = 18, ...props }: ServiceBrandIconProps) {
	return (
		<svg
			{...iconProps(size, props)}
			viewBox="0 0 640 640"
			fill="none"
			data-service-brand="uptime-kuma"
			aria-hidden="true"
		>
			<g transform="translate(320 320)">
				<path
					fill="currentColor"
					d="M170.4-84.36c53.69 122.74 53.69 199.7 0 230.86-80.55 46.74-290.44 60.99-350.86-10.86-40.28-47.9-40.28-121.24 0-220 40.96-67.46 99.17-101.19 174.63-101.19 75.47 0 134.21 33.73 176.23 101.19Z"
				/>
			</g>
		</svg>
	);
}

/** Adapted from henrygd/beszel internal/site/public/static/icon.svg (MIT). */
export function BeszelIcon({ size = 18, ...props }: ServiceBrandIconProps) {
	return (
		<svg
			{...iconProps(size, props)}
			viewBox="0 0 56 70"
			fill="none"
			data-service-brand="beszel"
			aria-hidden="true"
		>
			<path
				fill="currentColor"
				d="M35 70H0V0h35q4.4 0 8.2 1.7a21.4 21.4 0 0 1 6.6 4.5q2.9 2.8 4.5 6.6Q56 16.7 56 21a15.4 15.4 0 0 1-.3 3.2 17.6 17.6 0 0 1-.2.8 19.4 19.4 0 0 1-1.5 4 17 17 0 0 1-2.4 3.4 13.5 13.5 0 0 1-2.6 2.3 12.5 12.5 0 0 1-.4.3q1.7 1 3 2.5Q53 39.1 54 41a18.3 18.3 0 0 1 1.5 4 17.4 17.4 0 0 1 .5 3 15.3 15.3 0 0 1 0 1q0 4.4-1.7 8.2a21.4 21.4 0 0 1-4.5 6.6q-2.8 2.9-6.6 4.6Q39.4 70 35 70ZM14 14v14h21a7 7 0 0 0 2.3-.3 6.6 6.6 0 0 0 .4-.2Q39 27 40 26a6.9 6.9 0 0 0 1.5-2.2q.5-1.3.5-2.8a7 7 0 0 0-.4-2.3 6.6 6.6 0 0 0-.1-.4Q40.9 17 40 16a7 7 0 0 0-2.3-1.4 6.9 6.9 0 0 0-2.5-.6 7.9 7.9 0 0 0-.2 0H14Zm0 28v14h21a7 7 0 0 0 2.3-.4 6.6 6.6 0 0 0 .4-.1Q39 54.9 40 54a7 7 0 0 0 1.5-2.2 6.9 6.9 0 0 0 .5-2.6 7.9 7.9 0 0 0 0-.2 7 7 0 0 0-.4-2.3 6.6 6.6 0 0 0-.1-.4Q40.9 45 40 44a7 7 0 0 0-2.3-1.5 6.9 6.9 0 0 0-2.5-.6 7.9 7.9 0 0 0-.2 0H14Z"
			/>
		</svg>
	);
}

/** Adapted from remnawave/panel static/img/logo.svg (AGPL-3.0). */
export function RemnawaveIcon({ size = 18, ...props }: ServiceBrandIconProps) {
	return (
		<svg
			{...iconProps(size, props)}
			viewBox="0 0 16 16"
			fill="none"
			data-service-brand="remnawave"
			aria-hidden="true"
		>
			<path
				fill="currentColor"
				fillRule="evenodd"
				d="M8 1a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-1.5 0V1.75A.75.75 0 0 1 8 1Zm6 2a.75.75 0 0 1 .75.75v8.5a.75.75 0 0 1-1.5 0v-8.5A.75.75 0 0 1 14 3ZM5 4a.75.75 0 0 1 .75.75v6.5a.75.75 0 0 1-1.5 0v-6.5A.75.75 0 0 1 5 4Zm6 1a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 11 5ZM2 6a.75.75 0 0 1 .75.75v2.5a.75.75 0 0 1-1.5 0v-2.5A.75.75 0 0 1 2 6Z"
				clipRule="evenodd"
			/>
		</svg>
	);
}

/** Built-in Flowvy mark, reduced to the same monochrome treatment as other service icons. */
export function FlowvyIcon({ size = 18, ...props }: ServiceBrandIconProps) {
	return (
		<svg
			{...iconProps(size, props)}
			viewBox="0 0 512 512"
			fill="currentColor"
			data-service-brand="flowvy"
			aria-hidden="true"
		>
			<path d="M0 0h171v171H0zM171 0h170v171H171zM0 171h171v170H0zM0 341h171v171H0z" />
			<path opacity=".6" d="M341 0h171v171H341zM171 171h170v170H171z" />
			<path opacity=".82" d="M341 341h171v171H341z" />
		</svg>
	);
}
