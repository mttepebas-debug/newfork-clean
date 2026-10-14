import { installFetch } from "./mock/api";
import { guardNavigation, mountPanel } from "./harness";
import { currentPage, currentScenario } from "./pages";
import { expectSteps, holdRoutes, isFrame, setAfterApply } from "./sync";
import { resetWorld } from "./mock/world";
import { runSteps, setups } from "./scenarios";

document.title = `${currentPage().title} · PAGES`;

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
if (!isFrame) mountPanel();

declare const __PAGES_SCHEDULE__: boolean;
if (__PAGES_SCHEDULE__) {
  // Export preview counts PDF pages with pdf.js on the page's own thread.
  // Not awaited: in the one-file build the worker module is defined after
  // this point, so waiting here would read it before it exists.
  void import("./pdf-worker").then(({ installPdfWorker }) => installPdfWorker());
}
if (scenario?.steps?.length) {
  expectSteps();
  // Let the first data arrive before clicking.
  // The other frame's address waits until this frame's own steps are done (sync.ts).
  setTimeout(() => {
    holdRoutes(true);
    // A missing step says so in the notice; that frame's end then does not lead.
    // The last click's answer (a save, a new address) settles before the end is sent.
    void runSteps(scenario.steps!).finally(() => {
      const ok = document.getElementById("atlas-notice")?.dataset.open !== "true";
      setTimeout(() => holdRoutes(false, ok), 1000);
    });
  }, 600);
}
