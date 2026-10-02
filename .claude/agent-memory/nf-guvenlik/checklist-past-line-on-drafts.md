---
name: checklist-past-line-on-drafts
description: A rule that "the past stays as it was" must hold on every list a write walks: published shifts filtered by now() but drafts not, republish recomputing from the stored (past) start
metadata:
  type: feedback
---
When a write recomputes what a date or rule touches (closure impact, release, republish), check each list it walks for the past line separately. FB-6.7 C: published shifts were filtered `> now()` but the draft list had no date bound, and republish recomputed from the stored start (annual: every year since it began), so a 4-year-old draft shift lost its person (probe, rolled back, 2026-10-02).
**Why:** K11 / P09 say the past stays as it was; the save path clamped its dates, the republish path did not.
**How to apply:** for any service with both a save and a republish/restore path, probe the second one with a stored start before the line and a draft row there. See [[checklist-null-visibility-and-rolling-window]].
