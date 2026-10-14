// react-router with one change: the app's BrowserRouter becomes a memory
// router that starts on this atlas page's route, so the page works inside an
// Artifact frame (no real address bar to read or write). Anything that tries
// to leave the page is sent back with a short notice.
import { MemoryRouter, useLocation, useNavigate } from "react-router-real";
import { useEffect, type ReactNode } from "react";
import { leaveNotice, notice } from "./harness";
import { belongs, currentPage, currentScenario, startPath } from "./pages";
import { onRoute, post } from "./sync";
import { viewerRole } from "./mock/viewer";

export * from "react-router-real";

declare global {
  interface Window {
    /** For checks and screenshots: move to a route of this page. */
    __atlasNavigate?: (path: string) => void;
    __pagesPath?: string;
  }
}

function StayOnPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const page = currentPage();
  useEffect(() => {
    window.__atlasNavigate = (path: string) => navigate(path);
  }, [navigate]);
  // PAGES: both frames stay on the same address.
  useEffect(() => onRoute((path) => {
    if (path !== window.__pagesPath) navigate(path);
  }), [navigate]);
  useEffect(() => {
    const path = `${location.pathname}${location.search}`;
    window.__pagesPath = path;
    // The app reads window.location.search in places (Schedule's Escape layers):
    // the query follows the memory route; the file and the hash stay.
    try {
      if (window.location.search !== location.search)
        window.history.replaceState(window.history.state, "", `${window.location.pathname}${location.search}${window.location.hash}`);
    } catch { /* a frame that may not change its address */ }
    if (belongs(page, location.pathname)) post({ kind: "route", path });
  }, [location.pathname, location.search, page]);
  useEffect(() => {
    if (belongs(page, location.pathname)) return;
    if (page.signedOut) {
      // Signing in worked; the app itself is on the other atlas pages.
      window.__atlasSignOut?.();
      notice("Giriş yapıldı. Uygulamanın ekranları kendi PAGES sayfalarında.");
    } else {
      notice(leaveNotice(location.pathname));
    }
    navigate(startPath(page, viewerRole), { replace: true });
  }, [location.pathname, navigate, page]);
  return null;
}

/** "/path?query#fragment" as a router entry (a reset link carries its token in the fragment). */
function entry(path: string) {
  const [beforeHash, hash = ""] = path.split("#");
  const [pathname, search = ""] = beforeHash!.split("?");
  return { pathname: pathname!, search: search ? `?${search}` : "", hash: hash ? `#${hash}` : "", state: currentScenario()?.state ?? null };
}

export function BrowserRouter({ children }: { readonly children?: ReactNode }) {
  return (
    <MemoryRouter initialEntries={[entry(firstPath())]}>
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
