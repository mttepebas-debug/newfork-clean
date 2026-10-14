import "./preset";
import { installFetch } from "./mock/api";
import { guardNavigation } from "./harness";
import { mountPanel } from "./panel";
import { mountShell } from "./shell";
import "./vk/vk.css";
import { currentPage, currentScenario } from "./pages";
import { isFrame, setAfterApply } from "./sync";
import { resetWorld } from "./mock/world";
import { runSteps, setups } from "./scenarios";

document.title = "Schedule shift cards";

installFetch();
guardNavigation();

// PAGES: every open starts from the scenario's fresh demo data, the same in
// both frames.
const scenario = currentScenario();
if (isFrame) {
  resetWorld();
  if (scenario?.setup) setups[scenario.setup]?.();
}

const { StrictMode } = await import("react");
const { createRoot } = await import("react-dom/client");
await import("../../src/employees/employee-history-guard");
const { App, appQueryClient } = await import("../../src/App");
const { installEscapeFocus } = await import("../../src/lib/escape-focus");

installEscapeFocus(window, document);
setAfterApply(() => { void appQueryClient.invalidateQueries(); });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
if (!isFrame) { mountPanel(); mountShell(); }

declare const __PAGES_SCHEDULE__: boolean;
if (__PAGES_SCHEDULE__) {
  // Export preview counts PDF pages with pdf.js on the page's own thread.
  // Not awaited: in the one-file build the worker module is defined after
  // this point, so waiting here would read it before it exists.
  void import("./pdf-worker").then(({ installPdfWorker }) => installPdfWorker());
}
if (scenario?.steps?.length) {
  // Let the first data arrive before clicking.
  setTimeout(() => { void runSteps(scenario.steps!); }, 600);
}
