import { holdClock, installFetch, quietSockets, whenBlocked } from "./replay";
import { mountNotice, notice, guardClicks } from "./harness";
import { installPdfWorker } from "./pdf-worker";

holdClock();
quietSockets();
installFetch();
mountNotice();
guardClicks();
whenBlocked(notice);

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
void installPdfWorker();
