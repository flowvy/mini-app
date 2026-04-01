import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app.tsx";
import { initTelegramApp } from "./lib/telegram.ts";
import "./styles/tokens.css";
import "./styles/global.css";

initTelegramApp();

// biome-ignore lint/style/noNonNullAssertion: root element guaranteed in index.html
createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
