---
name: sayfa-atlasi
description: Newfork page atlas (Mert's rule 2026-10-09): every app page as an Artifact with real code + demo data; index link, source, maintenance
metadata:
  type: project
  modified: 2026-10-10T12:33:18.634Z
---

Mert's rule (2026-10-09 07:47Z): every app page gets visual documentation as an Artifact, kept current as code changes. Built by the thread "Sayfa atlası".

- Index ("Newfork sayfa atlası"): https://claude.ai/artifact/CgRj1az35H4TAz2NM3Na1p ; 17 pages + Schedule (links to the Schedule test page). First built from main 9a9793e2.
- All links, sha, date: /mnt/project-files/pages/atlas/source/tools/atlas.json. Procedure: /mnt/project-files/pages/atlas/README.md. Inventory: /mnt/project-files/pages/atlas/ENVANTER.md.
- After each train: rebuild affected pages from the new sha (tools/build.mjs), republish to the SAME urls, republish index.
- Gotcha: the Artifact publisher rejects an 8 MB page containing pdf.js as a "PR review page"; the atlas aliases SchedulePage away (pages are 2.2 MB).
- Gotcha: a session can watch at most 10 artifacts for comments; the atlas thread can't hear comments on Notifications, Account, Workspace Hub, Owner Setup, Employee Welcome, Sign In, Public Pages or the index.
- Source band rule (2026-10-10): publish only banded copies, made by `bash .temp/atlas/tools/prep-publish.sh <scratch dir> [ids]` (runs /mnt/project-files/pages/kaynak-bandi/bant.py). The Atlas tab follows the band's bottom edge.
- Gotcha: the band thread republished every page, so the first publish after a band change is refused ("newer version"). Diff the band block in the saved copy, Read its tail lines 155–190, then resend.
- Gotcha (2026-10-10): the auto-mode classifier refuses many Artifact republishes when it only has a coordinator relay ("External System Writes"). It needs Mert's own atlas-rule message attached.
Related: [[mert-calisma-anlasmasi-2026-10-09]]
