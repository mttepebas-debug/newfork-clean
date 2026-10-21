import "./employees/employee-history-guard";
import { reactErrorHandler } from "@sentry/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { installEscapeFocus } from "./lib/escape-focus";
import { initSentry } from "./lib/sentry";
import { registerServiceWorker } from "./lib/service-worker";
import { installStaleChunkReload } from "./shell/stale-chunk-reload";
import "./schedule/redesign/skin";

initSentry();
void registerServiceWorker();

const disposeStaleChunkReload = installStaleChunkReload();
import.meta.hot?.dispose(disposeStaleChunkReload);

const disposeEscapeFocus = installEscapeFocus(window, document);
import.meta.hot?.dispose(disposeEscapeFocus);

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement, {
  onUncaughtError: reactErrorHandler(),
  onCaughtError: reactErrorHandler(),
  onRecoverableError: reactErrorHandler(),
}).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
