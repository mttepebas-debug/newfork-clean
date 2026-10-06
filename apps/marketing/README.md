# Marketing site (`@newfork/marketing`)

The public website: home, product tour, solutions, pricing, FAQ, contact,
security and the legal pages. It is a separate package from the app
(`apps/web`) and never imports from it. Its only links into the product are
the app's own entry points (`/sign-in`), configured in `src/site/config.ts`.

## Commands

```sh
pnpm --filter @newfork/marketing dev         # http://127.0.0.1:5650 (renders in the browser)
pnpm --filter @newfork/marketing build       # typecheck + client build + SSR build + prerender → dist/
pnpm --filter @newfork/marketing serve       # serve dist/ like the static host: http://127.0.0.1:5651
pnpm --filter @newfork/marketing test
pnpm --filter @newfork/marketing typecheck
pnpm --filter @newfork/marketing lint
```

Windows: `pnpm.cmd`.

## Configuration

All optional (see `.env.example`). Defaults are placeholders on `.example`
domains and the build prints a warning while they are in use.

| Variable | Used for |
|---|---|
| `VITE_SITE_URL` | canonical URLs, sitemap, Open Graph |
| `VITE_APP_URL` | "Log in" / "Get started" → `$VITE_APP_URL/sign-in` |
| `VITE_CONTACT_ENDPOINT` | contact form POST target (JSON); without it the form opens a prefilled email |
| `VITE_CONTACT_*_EMAIL` | inboxes per contact topic |

The product name is a placeholder: `BRAND_NAME` in `src/site/config.ts`, the
wordmark component, `public/favicon.svg` and `public/og/` are the places
that change when the final name and logo arrive.

## How it is built

- **Routes** — `src/site/routes.ts` is the site map. The router, prerenderer,
  sitemap, breadcrumbs and `<head>` all read it. A page is
  `src/pages/<page>.tsx` (lazy chunk).
- **Prerendering** — `scripts/prerender.mjs` renders every route with
  `react-dom/static` and writes `dist/<path>/index.html`, `404.html`,
  `sitemap.xml` and `robots.txt`. The browser hydrates the static HTML.
- **Head / SEO** — `src/seo/head.ts` builds title, description, canonical,
  Open Graph, Twitter and JSON-LD (`src/seo/structured-data.ts`) from the
  route; the same tags are applied on client-side navigation.
- **Design tokens** — `src/styles/tokens.css` (CSS custom properties) is
  the only place raw values live; `src/styles/tokens.ts` mirrors the motion
  values for scripts.
- **Motion** — scenes are CSS state machines (`src/motion/scene.ts`,
  `src/styles/motion.css`): the root gets `s1 s2 …` per beat, elements carry
  `data-at` / `data-until`. An inline boot script sets
  `<html data-animate="on">` before first paint unless the visitor prefers
  reduced motion; without it every scene shows its finished frame, so
  reduced-motion visitors, no-JS visitors and crawlers see the whole story.
  Scenes pause off screen and in background tabs.
- **Product UI** — `src/product/` re-draws the app's real screens (schedule
  grid, shift chips, Shift Hub, Requests, announcements, documents) with
  the app's own colors and terminology. They are illustrations, not a
  second app.
- **Privacy** — the site loads no analytics or advertising technology.
  `src/privacy/consent.ts` records the visitor's choice, honors Global
  Privacy Control, and is the only allowed way to load optional scripts
  later (`whenAllowed`).

## Truthfulness

Every product statement on the site must match what the app does today.
`docs/PRODUCT-TRUTH.md` maps claims to code evidence and lists what must
not be claimed (planned or absent features). Check it before writing copy.

## Deploying

A separate static project (e.g. Vercel with root directory
`apps/marketing`; `vercel.json` here sets the build, security headers and
caching). It does not touch the app's deployment (`/vercel.json`).
