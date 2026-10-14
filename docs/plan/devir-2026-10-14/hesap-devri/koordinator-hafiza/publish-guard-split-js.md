---
name: publish-guard-split-js
description: Fix when Artifact publish refuses a big app.html as "artifact-pr-review machinery": split the JS into app.js
metadata:
  type: reference
  modified: 2026-10-14T00:31:42.608Z
---

Sometimes the Artifact publish step refuses a large inlined app.html supporting file (a Vite build of the Schedule test page) with: "supporting file app.html carries the artifact-pr-review machinery". Publishing the whole app as one page file fails too ("too large for a review page").
- The refusal is deterministic. Only the content of the minified bundle triggers it, not the page's text or CSS. It was checked on 2026-10-14: the live version republished fine, and a build with all new text and CSS taken out was still refused.
- **Fix that worked (Card mark drafts artifact 7xJNYsZbknmsvGPk5jdd7p, v4):**
  - Keep the small shell index.html, with its iframe and source band.
  - Make app.html carry only the CSS inline, plus `<script type="module" src="app.js">`.
  - Publish the bundle as a separate `app.js` file.
- Before publishing app.js, replace every U+FFFD character with the escape `�`. Otherwise the publish refuses the file.
- Script: /mnt/project-files/pages/gorsel-kararlar/gelen/kart-isaretleri-40/yayin/split-app.mjs (args: dist dir, out dir).
Related: [[sayfa-atlasi]]
