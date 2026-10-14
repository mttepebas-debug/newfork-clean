---
name: gh-cli-verifies-ci-failures
description: gh is already authenticated in this environment; use gh api .../actions/jobs/<id>/logs to read a CI run's actual assertion output instead of trusting a task message's summary of what failed
metadata:
  type: reference
---

`gh auth status` is already logged in (account mttepebas-debug) in worker/
subagent sessions. For a reported CI failure, don't trust a task message's
paraphrase of which line/value failed — pull the real log:

```
gh api repos/mttepebas-debug/newfork-clean/actions/runs/<run_id>/attempts/<n>/jobs \
  -q '.jobs[] | "\(.id) \(.name) \(.conclusion)"'
gh api repos/mttepebas-debug/newfork-clean/actions/jobs/<job_id>/logs > /tmp/x.log
grep -n "Expected:\|Received:\|Error:" /tmp/x.log
```

**Why:** BL-180's task message said the failure was a torn read at line 68
(`deniz-b` wrong right after line 67's poll passed). The actual two CI logs
(runs 36264449301, 36265792925 attempt 1) showed the opposite: line 67's
`expect.poll` itself timed out (`Received: "Ali"`, never flipped) — a plain
timeout, not a partial-write race. Believing the paraphrase would have sent
the investigation down a data-integrity path for a plain CI-load flake.

**How to apply:** whenever a task hands you a specific failing
line/expected/received, re-derive it from `gh api .../logs` before treating
it as ground truth, especially before spending time on data-race hypotheses.
