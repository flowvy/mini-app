const DUST_DURATION_MS = 800;
const DUST_LAYER_COUNT = 12;
const MAX_CAPTURE_DPR = 1.5;

export interface PreparedDustEffect {
	start: (delayMs?: number) => void;
	cancel: () => void;
}

function noise(x: number, y: number): number {
	let value = Math.imul(x + 17, 374761393) + Math.imul(y + 29, 668265263);
	value = (value ^ (value >>> 13)) >>> 0;
	return Math.imul(value, 1274126177) >>> 0;
}

function removeOverlay(overlay: HTMLDivElement): void {
	for (const animation of overlay.getAnimations({ subtree: true })) animation.cancel();
	overlay.remove();
}

export function prefersReducedMotion(): boolean {
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export async function prepareDustEffect(
	element: HTMLElement | undefined,
): Promise<PreparedDustEffect | null> {
	if (!element || prefersReducedMotion()) return null;

	const bounds = element.getBoundingClientRect();
	if (bounds.width < 1 || bounds.height < 1) return null;

	try {
		const { snapdom } = await import("@zumer/snapdom");
		const source = await snapdom.toCanvas(element, {
			fast: true,
			dpr: Math.min(window.devicePixelRatio || 1, MAX_CAPTURE_DPR),
			embedFonts: false,
			outerTransforms: false,
			outerShadows: false,
		});
		const sourceContext = source.getContext("2d", { willReadFrequently: true });
		if (!sourceContext || source.width === 0 || source.height === 0) return null;

		const sourcePixels = sourceContext.getImageData(0, 0, source.width, source.height);
		const layerImages = Array.from(
			{ length: DUST_LAYER_COUNT },
			() => new ImageData(source.width, source.height),
		);
		for (let y = 0; y < source.height; y += 1) {
			for (let x = 0; x < source.width; x += 1) {
				const pixelOffset = (y * source.width + x) * 4;
				if (sourcePixels.data[pixelOffset + 3] < 8) continue;

				const random = noise(x, y) / 0xffffffff;
				const sweep = x / Math.max(source.width - 1, 1);
				const layerIndex = Math.min(
					DUST_LAYER_COUNT - 1,
					Math.floor((sweep * 0.58 + random * 0.42) * DUST_LAYER_COUNT),
				);
				const layerPixels = layerImages[layerIndex].data;
				layerPixels[pixelOffset] = sourcePixels.data[pixelOffset];
				layerPixels[pixelOffset + 1] = sourcePixels.data[pixelOffset + 1];
				layerPixels[pixelOffset + 2] = sourcePixels.data[pixelOffset + 2];
				layerPixels[pixelOffset + 3] = sourcePixels.data[pixelOffset + 3];
			}
		}

		const overlay = document.createElement("div");
		overlay.dataset.flowvyDustOverlay = "true";
		overlay.setAttribute("aria-hidden", "true");
		Object.assign(overlay.style, {
			position: "fixed",
			left: `${bounds.left}px`,
			top: `${bounds.top}px`,
			width: `${bounds.width}px`,
			height: `${bounds.height}px`,
			pointerEvents: "none",
			opacity: "0.001",
			overflow: "visible",
			contain: "layout style",
			transform: "translateZ(0)",
			zIndex: "1000",
		});

		const layers = layerImages.map((imageData, index) => {
			const canvas = document.createElement("canvas");
			canvas.width = source.width;
			canvas.height = source.height;
			canvas.dataset.flowvyDustLayer = String(index);
			canvas.setAttribute("aria-hidden", "true");
			Object.assign(canvas.style, {
				position: "absolute",
				inset: "0",
				width: "100%",
				height: "100%",
				transformOrigin: "center",
				transform: "translate3d(0, 0, 0)",
				backfaceVisibility: "hidden",
				willChange: "transform, opacity",
			});
			canvas.getContext("2d")?.putImageData(imageData, 0, 0);
			overlay.append(canvas);
			return canvas;
		});
		document.body.append(overlay);

		let started = false;
		let cleanupTimer: number | undefined;
		return {
			start(delayMs = 0) {
				if (started || !overlay.isConnected) return;
				started = true;
				overlay.style.opacity = "1";
				layers.forEach((canvas, index) => {
					const layerProgress = index / Math.max(layers.length - 1, 1);
					const driftY = ((index * 37) % 15) - 7;
					const rotation = ((index * 29) % 17) - 8;
					canvas.animate(
						[
							{ opacity: 1, transform: "translate3d(0, 0, 0) scale(1)" },
							{
								offset: 0.45,
								opacity: 0.9,
								transform: `translate3d(${3 + layerProgress * 5}px, ${driftY * 0.2}px, 0) scale(0.997)`,
							},
							{
								opacity: 0,
								transform: `translate3d(${14 + layerProgress * 18}px, ${driftY}px, 0) scale(0.98) rotate(${rotation * 0.25}deg)`,
							},
						],
						{
							duration: DUST_DURATION_MS - index * 5,
							delay: delayMs + index * 9,
							easing: "cubic-bezier(0.25, 0.1, 0.25, 1)",
							fill: "forwards",
						},
					);
				});
				cleanupTimer = window.setTimeout(
					() => removeOverlay(overlay),
					delayMs + DUST_DURATION_MS + 180,
				);
			},
			cancel() {
				if (cleanupTimer !== undefined) window.clearTimeout(cleanupTimer);
				removeOverlay(overlay);
			},
		};
	} catch {
		return null;
	}
}
