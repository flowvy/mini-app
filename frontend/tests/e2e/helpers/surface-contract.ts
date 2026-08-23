import type { Locator } from "@playwright/test";
import { expect } from "@playwright/test";

export interface EdgeContract {
	width: string;
	style: string;
	color: string;
}

export interface OutlineContract extends EdgeContract {
	offset: string | readonly string[];
}

export interface SurfaceContract {
	background: string;
	border: EdgeContract | Record<"top" | "right" | "bottom" | "left", EdgeContract>;
	outline: OutlineContract;
	boxShadow: string;
	color: string;
}

export interface SvgContract {
	color: string;
	fill: string;
	stroke: string;
}

export const noEdge = (color = "currentColor"): EdgeContract => ({
	width: "0px",
	style: "none",
	color,
});

export const noOutline = (color = "currentColor"): OutlineContract => ({
	width: "3px",
	style: "none",
	color,
	offset: ["0px", "-2px"],
});

async function resolvedValue(locator: Locator, property: string, value: string): Promise<string> {
	return locator.evaluate(
		(element, input) => {
			const elementStyle = getComputedStyle(element);
			const probe = document.createElement("span");
			probe.style.color = elementStyle.color;
			probe.style.setProperty(input.property, input.value);
			document.body.append(probe);
			const resolved = getComputedStyle(probe).getPropertyValue(input.property);
			probe.remove();
			return resolved;
		},
		{ property, value },
	);
}

function edgeFor(
	border: SurfaceContract["border"],
	side: "top" | "right" | "bottom" | "left",
): EdgeContract {
	return "width" in border ? border : border[side];
}

export async function expectSurfaceContract(
	locator: Locator,
	contract: SurfaceContract,
): Promise<void> {
	await expect(locator).toBeVisible();
	const expectedColor = await resolvedValue(locator, "color", contract.color);
	const resolveColor = (property: string, value: string) =>
		value === "currentColor"
			? Promise.resolve(expectedColor)
			: resolvedValue(locator, property, value);
	const expected = {
		background: await resolvedValue(locator, "background-color", contract.background),
		border: {} as Record<"top" | "right" | "bottom" | "left", EdgeContract>,
		outline: {
			width: contract.outline.width,
			style: contract.outline.style,
			color: await resolveColor("outline-color", contract.outline.color),
			offset: Array.isArray(contract.outline.offset)
				? contract.outline.offset[0]
				: contract.outline.offset,
		},
		boxShadow: await resolvedValue(locator, "box-shadow", contract.boxShadow),
		color: expectedColor,
	};
	for (const side of ["top", "right", "bottom", "left"] as const) {
		const expectedEdge = edgeFor(contract.border, side);
		expected.border[side] = {
			width: expectedEdge.width,
			style: expectedEdge.style,
			color: await resolveColor(`border-${side}-color`, expectedEdge.color),
		};
	}

	await expect
		.poll(async () => {
			const actual = await locator.evaluate((element) => {
				const style = getComputedStyle(element);
				return {
					background: style.backgroundColor,
					border: {
						top: {
							width: style.borderTopWidth,
							style: style.borderTopStyle,
							color: style.borderTopColor,
						},
						right: {
							width: style.borderRightWidth,
							style: style.borderRightStyle,
							color: style.borderRightColor,
						},
						bottom: {
							width: style.borderBottomWidth,
							style: style.borderBottomStyle,
							color: style.borderBottomColor,
						},
						left: {
							width: style.borderLeftWidth,
							style: style.borderLeftStyle,
							color: style.borderLeftColor,
						},
					},
					outline: {
						width: style.outlineWidth,
						style: style.outlineStyle,
						color: style.outlineColor,
						offset: style.outlineOffset,
					},
					boxShadow: style.boxShadow,
					color: style.color,
				};
			});
			if (
				Array.isArray(contract.outline.offset) &&
				contract.outline.offset.includes(actual.outline.offset)
			) {
				actual.outline.offset = contract.outline.offset[0];
			}
			return actual;
		})
		.toEqual(expected);
}

export async function expectSvgContract(locator: Locator, contract: SvgContract): Promise<void> {
	await expect(locator).toBeVisible();
	const expectedColor = await resolvedValue(locator, "color", contract.color);
	const expected = {
		color: expectedColor,
		fill: await resolvedValue(locator, "fill", contract.fill),
		stroke:
			contract.stroke === "currentColor"
				? expectedColor
				: await resolvedValue(locator, "stroke", contract.stroke),
	};
	await expect
		.poll(() =>
			locator.evaluate((element) => {
				const style = getComputedStyle(element);
				return { color: style.color, fill: style.fill, stroke: style.stroke };
			}),
		)
		.toEqual(expected);
}
