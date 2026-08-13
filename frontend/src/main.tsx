import { StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app.tsx";
import "./i18n";
import { initTelegramApp } from "./lib/telegram.ts";
import { initVisualViewport } from "./lib/visual-viewport.ts";
import "./styles/tokens.css";
import "./styles/global.css";

initTelegramApp();
initVisualViewport();

// biome-ignore lint/style/noNonNullAssertion: root element guaranteed in index.html
createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<Suspense fallback={null}>
			<App />
		</Suspense>
	</StrictMode>,
);
