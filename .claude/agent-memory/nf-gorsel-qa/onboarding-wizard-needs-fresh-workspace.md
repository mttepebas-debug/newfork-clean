---
name: onboarding-wizard-needs-fresh-workspace
description: /onboarding is unreachable once a workspace (e.g. Meyhouse) is fully set up; it redirects to /app/workspace instead of showing the wizard.
metadata:
  type: project
---

Navigating to `http://127.0.0.1:<port>/onboarding` while logged in as owner@newfork.test (Meyhouse fixture, already fully onboarded) redirects to `/app/workspace`. The wizard route only renders for a workspace still in the "pending onboarding" state.

**Why:** BL-218 QA needed to check the "Add your team" step (Management/Owner primary-job rule during setup) but this local fixture has no pending-onboarding workspace to reach it with.

**How to apply:** to visually check the setup wizard, either use `owner@newfork.test`'s "Create your workspace" flow from `/workspaces` to spin up a fresh one (DB write, needs explicit scope) or ask `nf-test`/`nf-db` for a fixture in the pending-onboarding state. Don't spend time re-trying `/onboarding` directly against Meyhouse — it will keep redirecting.
