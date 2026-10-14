---
name: resend-email-e2e
description: API emails go through Resend, never Supabase SMTP, so local mailpit never sees them; e2e mints auth links via GoTrue admin REST instead
metadata:
  type: reference
---

- Invitations, account-deletion recovery and password reset (BL-137) all POST to api.resend.com; with no
  RESEND_API_KEY outside production they skip silently. Mailpit (config.toml `[local_smtp]`, 55324) only
  catches GoTrue's own SMTP mail, so an e2e cannot read these emails.
- e2e workaround: `playwright.config.ts` puts `E2E_SUPABASE_URL` / `E2E_SERVICE_ROLE_KEY` in process.env;
  `POST {url}/auth/v1/admin/generate_link {type:"recovery", email}` returns `hashed_token` at the TOP level
  (supabase-js moves it under `properties`). See `e2e/flows/password-reset.spec.ts`.
- Playwright trap: `getByLabel("New password")` also matches a `<main aria-labelledby>` whose heading
  contains the phrase ("Choose a new password"); use `{ exact: true }`.
