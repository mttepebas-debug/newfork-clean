// react-router with one change: the app's BrowserRouter becomes a memory
// router that starts on the Schedule page, so the page works inside an
// Artifact frame (no real address bar to read or write). Anything that
// tries to leave Schedule is sent back with a short notice.
import { MemoryRouter, useLocation, useNavigate } from "react-router-real";
import { useEffect, type ReactNode } from "react";
import { notice } from "./harness";

export * from "react-router-real";

const allowed = /^\/app\/schedule(\/(templates|export))?\/?$/;

function ScheduleOnly() {
  const location = useLocation();
  const navigate = useNavigate();
  // The test page's menu moves the page (for example the long-names scenario).
  useEffect(() => {
    (window as unknown as { __stNavigate?: (to: string) => void }).__stNavigate = (to) => navigate(to);
  }, [navigate]);
  useEffect(() => {
    if (allowed.test(location.pathname)) return;
    notice("This test page only contains Schedule.");
    navigate("/app/schedule", { replace: true });
  }, [location.pathname, navigate]);
  return null;
}

export function BrowserRouter({ children }: { readonly children?: ReactNode }) {
  return (
    <MemoryRouter initialEntries={["/app/schedule"]}>
      <ScheduleOnly />
      {children}
    </MemoryRouter>
  );
}
