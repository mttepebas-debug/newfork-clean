import { installFetch } from "./mock/api";
import { guardNavigation, mountPanel, notice } from "./harness";
import { installTimeOffRule } from "./time-off-rule";
import { installPdfWorker } from "./pdf-worker";

installFetch();
guardNavigation();

const { StrictMode } = await import("react");
const { createRoot } = await import("react-dom/client");
await import("../../src/employees/employee-history-guard");
const { App } = await import("../../src/App");
const { installEscapeFocus } = await import("../../src/lib/escape-focus");

installEscapeFocus(window, document);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
mountPanel();
installTimeOffRule(notice);
void installPdfWorker();
