import { StrictMode } from "react";
import { prerender } from "react-dom/static";
import { StaticRouter } from "react-router";
import { App } from "./App";
import { buildHead, renderHead } from "./seo/head";
import { findRoute } from "./site/routes";

export { ROUTES, NOT_FOUND_ROUTE } from "./site/routes";
export { SITE_URL, APP_URL, USING_PLACEHOLDER_DOMAINS } from "./site/config";

export async function render(url: string): Promise<{ html: string; head: string }> {
  const { prelude } = await prerender(
    <StrictMode>
      <StaticRouter location={url}>
        <App />
      </StaticRouter>
    </StrictMode>,
  );
  const html = await new Response(prelude).text();
  return { html, head: renderHead(buildHead(findRoute(url))) };
}
