# Build guide (marketing site)

How to add or change a page, section, scene or product illustration. Read
`docs/BRAND.md` (look, voice, motion) and `docs/PRODUCT-TRUTH.md` (what the
product really does) first.

## Files

| What | Where |
|---|---|
| Pages (one lazy chunk each) | `src/pages/<Name>Page.tsx`, registered in `src/site/routes.ts` |
| Home and shared sections | `src/sections/<Section>.tsx` + `src/sections/<section>.css` |
| Scenes (animated stories) | `src/scenes/<Scene>.tsx` + `.css` |
| Product illustrations (the app re-drawn) | `src/product/*` (`ProductStage`, `AppWindow`, `schedule`, `requests`, `phone`, `employee`, `team`) |
| Brand components (buttons, section header, CTA, signature device) | `src/components/*` |
| Copy that is reused or long (FAQ, pricing, legal) | `src/content/*.ts` |
| Tokens | `src/styles/tokens.css` (never raw hex in component CSS; product illustrations use the `--app-*` tokens in `src/product/app-ui.css`) |
| Global CSS imports | `src/styles/index.css` (add your CSS file there) |

## Rules

1. **Truth.** Every product statement must exist in `docs/PRODUCT-TRUTH.md`
   as implemented. Use the app's own words (Schedule, Publish, Requests,
   Shift Hub, Time off, Availability, Open shift, Find cover or swap,
   Acknowledge, workspace, team). No metrics, customers, logos, quotes,
   awards, integrations, native-app badges, SMS, push or email notification
   claims (notifications are in-app), no AI, no time clock, payroll or labor
   cost.
2. **Product illustrations look like the app.** Build them from
   `src/product/*` inside a `ProductStage` (fixed design width, scales like an
   image). Need a new screen part? Add it to `src/product/` with values from
   `apps/web` (read the real component and CSS), not invented styling.
3. **Scenes are CSS state machines** (`src/motion/scene.ts`). Wrap in
   `<Scene script={SCRIPT}>` with a module-level script; mark elements with
   `data-at="N"` (appears at beat N) and `data-until="N"` (leaves at beat N);
   style intermediate states with `.scene.sN` selectors under
   `:root[data-animate="on"]`. The markup with no beat classes is the opening
   frame; the markup without `data-animate` is the finished frame — both must
   read well. Never render content conditionally on the step; render every
   state and let classes choose. Do not nest scenes. Animate only `transform`,
   `opacity`, `clip-path` (and colors on small elements). Each scene must
   answer "what does this motion explain?" in a comment above its script.
4. **Reduced motion and no JS** show the finished frame (automatic if rule 3
   is followed). Never hide content in a way only JS can reveal, except
   through the scene/reveal system.
5. **Responsive by design**: check 390, 430, 768, 1024, 1280, 1440. On
   phones choose a different composition (crop the grid to fewer days, show
   the phone UI) rather than shrinking a desktop picture until it is
   unreadable. No horizontal page scroll.
6. **Accessibility**: one `<h1>` per page (the page owns it), headings in
   order, landmarks from the layout, visible focus (`:focus-visible`),
   AA contrast, `aria-hidden="true"` on purely decorative illustrations and
   a short text alternative (`role="img"` + `aria-label`, or a visually
   hidden caption) for illustrations that carry meaning.
7. **App links** only via `APP_LINKS` (`src/site/config.ts`). Internal links
   via `Link` from `react-router`.
8. **No new npm packages.** React, React Router and CSS only.
9. **Performance**: no images where CSS/SVG can draw it; lazy-start scenes
   (the Scene component pauses off screen); keep each page chunk small.

## Checking your work

- `pnpm --filter @newfork/marketing typecheck` (fix errors in your files;
  ignore others' files while parallel work is in progress).
- Dev server on your own port: `pnpm --filter @newfork/marketing exec vite
  --host 127.0.0.1 --port <port> --strictPort`.
- Screenshots: `node <scratchpad>/shot.mjs <url> <out.png> <width> <height>`
  (Playwright with `/opt/pw-browsers/chromium`). Check each width above,
  plus reduced motion (`page.emulateMedia({ reducedMotion: "reduce" })`).
- Do not run `pnpm build` while other work is running in the same tree
  (it writes `dist/`); the integrator runs it.
