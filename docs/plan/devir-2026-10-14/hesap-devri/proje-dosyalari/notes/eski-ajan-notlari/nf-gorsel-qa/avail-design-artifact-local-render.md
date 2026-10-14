---
name: avail-design-artifact-local-render
description: How to render Mert's chosen availability design (claude.ai artifact) locally for side-by-side screenshots, and what in it is old look or lab-only
metadata:
  type: reference
---

Artifact https://claude.ai/artifact/DzdPU3Nhep6mo4nPMZUHDu (files index.html, app.html, app.js, app.css). `Artifact read` with `paths:[...]` and `out_dir` saves them; serve the folder with a tiny node static server on a free port (used 5644) and open `index.html`. Drive the inner app with `document.getElementById("app").contentWindow.postMessage({availgo:"/app/dev/avail/s2?variant=b"},"*")` (sets s1..s5, variants a-e); cells are `.schedule-cell` inside the iframe.

Measured 2026-10-04 (AVAIL-002 C1 QA): in the lab the empty-cell hover bubble and the S1 "!" bubble are still the OLD look; the C3 "Tinted header" decision lives in docs/plan/KARARLAR.md (C3, K18), not in the artifact. S1 A shows "Availability on" with a green pressed tint that exists only in lab css (`.avail-stage .schedule-edit-banner button[aria-pressed=true]`); the real Paste mode has no pressed style. S2 B card shows the note's hours ("Wed after 6:00 PM") and "author · date", which the real data contract does not carry.

Pre-existing, not C1: at 375px the Schedule `Settings` menu panel (`.schedule-settings-menu-panel`, left:0, width 252px, styles.css ~3563/4034) opens from the button at x~265 and is clipped at the right edge, so its rows are unreachable on a phone.
