import "./employees/employee-history-guard";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { installEscapeFocus } from "./lib/escape-focus";

const disposeEscapeFocus = installEscapeFocus(window, document);
import.meta.hot?.dispose(disposeEscapeFocus);

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
