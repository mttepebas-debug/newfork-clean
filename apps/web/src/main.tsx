import "./employees/employee-history-guard";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { installEscapeFocus } from "./lib/escape-focus";

const disposeEscapeFocus = installEscapeFocus(window, document);
import.meta.hot?.dispose(disposeEscapeFocus);

if (import.meta.env.DEV) {
  void import("./dev/ui-variant/install").then((module) =>
    module.installUiVariant(),
  );
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
