import "./employees/employee-history-guard";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { installEscapeFocus } from "./lib/escape-focus";

const disposeEscapeFocus = installEscapeFocus(window, document);
import.meta.hot?.dispose(disposeEscapeFocus);

// DEV-only visual variant switch for BL-136; removed once the variant is picked.
if (import.meta.env.DEV) {
  const bl136 = new URLSearchParams(window.location.search).get("bl136");
  if (bl136) document.documentElement.dataset.bl136 = bl136;
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
