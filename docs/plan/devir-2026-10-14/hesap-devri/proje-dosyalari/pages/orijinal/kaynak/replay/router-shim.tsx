// react-router with one change: the app's BrowserRouter becomes a memory
// router that starts on the screen the frame asked for (#route=...), because
// a published page has no address bar of its own. The parent page can move it
// with postMessage({ type: "nf-go", route }).
import { MemoryRouter, useLocation, useNavigate } from "react-router-real";
import { useEffect, type ReactNode } from "react";
import { startRoute } from "./replay";

export * from "react-router-real";

function Bridge() {
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    const listen = (event: MessageEvent) => {
      if (event.data?.type === "nf-go" && typeof event.data.route === "string") navigate(event.data.route);
    };
    window.addEventListener("message", listen);
    return () => window.removeEventListener("message", listen);
  }, [navigate]);
  useEffect(() => {
    window.parent?.postMessage({ type: "nf-at", route: location.pathname + location.search }, "*");
  }, [location.pathname, location.search]);
  return null;
}

export function BrowserRouter({ children }: { readonly children?: ReactNode }) {
  return (
    <MemoryRouter initialEntries={[startRoute]}>
      <Bridge />
      {children}
    </MemoryRouter>
  );
}
