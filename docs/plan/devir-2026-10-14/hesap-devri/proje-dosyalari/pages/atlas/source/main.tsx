import { installFetch } from "./mock/api";
import { guardNavigation, mountPanel } from "./harness";
import { currentPage } from "./pages";

document.title = `${currentPage().title} · Newfork atlas`;

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
