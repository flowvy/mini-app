import type { Page } from "@playwright/test";

/** Installs a deterministic VisualViewport that can model software-keyboard geometry. */
export async function installVisualViewportMock(page: Page) {
	await page.addInitScript(() => {
		class TestVisualViewport extends EventTarget {
			private overriddenHeight: number | null = null;
			offsetTop = 0;

			get height() {
				return this.overriddenHeight ?? window.innerHeight;
			}

			set height(value: number) {
				this.overriddenHeight = value;
			}

			get width() {
				return window.innerWidth;
			}
		}

		const viewport = new TestVisualViewport();
		Object.defineProperty(window, "visualViewport", {
			configurable: true,
			value: viewport,
		});
		Object.defineProperty(window, "__setTestVisualViewport", {
			configurable: true,
			value: (height: number, offsetTop = 0) => {
				viewport.height = height;
				viewport.offsetTop = offsetTop;
				viewport.dispatchEvent(new Event("resize"));
			},
		});
	});
}

export async function setTestVisualViewport(page: Page, height: number, offsetTop = 0) {
	await page.evaluate(
		({ nextHeight, nextOffsetTop }) => {
			(
				window as typeof window & {
					__setTestVisualViewport: (height: number, offsetTop?: number) => void;
				}
			).__setTestVisualViewport(nextHeight, nextOffsetTop);
		},
		{ nextHeight: height, nextOffsetTop: offsetTop },
	);
}
