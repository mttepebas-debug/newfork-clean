---
name: artifact-silme-onayi
description: Artifact delete approval prompts don't show in the Project thread; Mert must open the thread's session page to Allow
metadata:
  type: feedback
  modified: 2026-10-12T08:09:11.281Z
---

Artifact `delete` (and other permission-gated tool calls) raise an approval prompt that Mert does NOT see in the Project thread view. It shows on the thread's Claude Code session page: https://claude.ai/code/SESSION_ID (the Claude-Session link in commit attribution). Proven 2026-10-12: old atlas deletion stalled twice in-thread; worked once Mert opened the session page.

**Why:** Mert said "Allow çıkmıyor" twice; two threads got stuck.
**How to apply:** Before a gated call, reply with the session page link and say "bu sayfada Allow de", then make the call. Computer use on Mert's PC is not an alternative: Claude app can't be controlled and Chrome is read-only tier.

Old atlas status: all 18 deleted 2026-10-12 (14 by Claude, 4 earlier); Artifact dizini republished (v11) without atlas rows. Related: [[sayfa-atlasi]]
