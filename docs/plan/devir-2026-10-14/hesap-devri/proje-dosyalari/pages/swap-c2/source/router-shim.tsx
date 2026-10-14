// react-router with one change: the app's BrowserRouter becomes a memory
// router that starts on this atlas page's route, so the page works inside an
// Artifact frame (no real address bar to read or write). Anything that tries
// to leave the page is sent back with a short notice.
import { MemoryRouter, useLocation, useNavigate } from "react-router-real";
import { useEffect, type ReactNode } from "react";
import { leaveNotice, notice } from "./harness";
import { belongs, currentPage, startPath } from "./pages";
import { viewerRole } from "./mock/viewer";

export * from "react-router-real";

declare global {
  interface Window {
    /** For checks and screenshots: move to a route of this page. */
    __atlasNavigate?: (path: string) => void;
  }
}

function StayOnPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const page = currentPage();
  useEffect(() => {
    window.__atlasNavigate = (path: string) => navigate(path);
  }, [navigate]);
  useEffect(() => {
    if (belongs(page, location.pathname)) return;
    if (page.signedOut) {
      // Signing in worked; the app itself is on the other atlas pages.
      window.__atlasSignOut?.();
      notice("Signed in. The app's own screens are on the other atlas pages.");
    } else {
      notice(leaveNotice(location.pathname));
    }
    navigate(startPath(page, viewerRole), { replace: true });
  }, [location.pathname, navigate, page]);
  return null;
}

export function BrowserRouter({ children }: { readonly children?: ReactNode }) {
  return (
    <MemoryRouter initialEntries={[firstPath()]}>
      <StayOnPage />
      {children}
    </MemoryRouter>
  );
}

/** The page's own start, or (dev server, checks) ?path=<route of this page>. */
function firstPath(): string {
  const page = currentPage();
  const asked = new URLSearchParams(window.location.search).get("path");
  return asked && belongs(page, asked.split("?")[0]!) ? asked : startPath(page, viewerRole);
}
