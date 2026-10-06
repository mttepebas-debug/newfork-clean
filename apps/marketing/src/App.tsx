import { lazy, Suspense, useEffect, useLayoutEffect, useRef, type ComponentType } from "react";
import { Route, Routes, useLocation } from "react-router";
import { SiteLayout } from "./components/SiteLayout";
import { applyHead, buildHead } from "./seo/head";
import { findRoute, NOT_FOUND_ROUTE, ROUTES } from "./site/routes";

type PageModule = { default: ComponentType };

// Each page is its own chunk; the prerenderer adds a modulepreload for the
// page being served (scripts/prerender.mjs).
const pageModules = import.meta.glob<PageModule>("./pages/*.tsx");

function pageFor(name: string) {
  const loader = pageModules[`./pages/${name}.tsx`];
  if (!loader) throw new Error(`Missing page module src/pages/${name}.tsx`);
  return lazy(loader);
}

const PAGES = new Map(
  [...ROUTES, NOT_FOUND_ROUTE].map((route) => [route.page, pageFor(route.page)]),
);

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Keeps <head> and scroll position in step with client-side navigation. */
function RouteEffects() {
  const { pathname, hash } = useLocation();
  const firstRender = useRef(true);
  useEffect(() => {
    // Idempotent on a prerendered first load; needed in dev and on navigation.
    applyHead(buildHead(findRoute(pathname)));
  }, [pathname]);
  useIsomorphicLayoutEffect(() => {
    if (firstRender.current) {
      // The browser restores scroll (and jumps to #hash) on a fresh load.
      firstRender.current = false;
      return;
    }
    if (hash) {
      document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView();
      return;
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

export function App() {
  return (
    <SiteLayout>
      <RouteEffects />
      <Suspense fallback={null}>
        <Routes>
          {ROUTES.map((route) => {
            const Page = PAGES.get(route.page)!;
            return <Route key={route.path} path={route.path} element={<Page />} />;
          })}
          {(() => {
            const NotFound = PAGES.get(NOT_FOUND_ROUTE.page)!;
            return <Route path="*" element={<NotFound />} />;
          })()}
        </Routes>
      </Suspense>
    </SiteLayout>
  );
}
