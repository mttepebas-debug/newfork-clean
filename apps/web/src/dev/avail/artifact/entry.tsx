// AVAIL-TASARIM artifact bundle: the real app shell and the variant lab, no server, no sign-in.
import "../../../styles.css";
import "../../../shell/tooltip.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@newfork/ui";
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router";
import { AppShell } from "../../../shell/AppShell";
import AvailLabPage from "../AvailLabPage";

const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
const labPath = "/app/dev/avail";

// Tells the page around the frame where the viewer is; takes its set and variant buttons.
function Bridge() {
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    window.parent.postMessage({ avail: { path: location.pathname, search: location.search } }, "*");
  }, [location]);
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const go: unknown = event.data?.availgo;
      if (typeof go === "string" && go.startsWith(labPath)) navigate(go);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [navigate]);
  return null;
}

function NotInPreview() {
  return (
    <section className="settings-page" aria-labelledby="avail-not-in-preview">
      <h1 id="avail-not-in-preview">Not part of this preview</h1>
      <p>This preview only holds the availability designs. Pick a set at the top.</p>
    </section>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[labPath]}>
        <Toaster />
        <Bridge />
        <Routes>
          <Route path="/app" element={<AppShell />}>
            <Route path="dev/avail/:set?" element={<AvailLabPage />} />
            <Route path="*" element={<NotInPreview />} />
          </Route>
          <Route path="*" element={<Navigate to={labPath} replace />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  </StrictMode>,
);
