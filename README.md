# Newfork Clean

Clean Newfork rebuild through Phase 10A local verification, Phase 11 time-capture implementation,
Phase 12 kiosk implementation through manager controls, Phase 12D kiosk deployment research, and
the drafted Phase 13 payroll-readiness product definition.

Old Newfork remains read-only reference material at `C:\Users\TheWe\newfork`.
Do not copy legacy compliance, payroll, time-entry, kiosk, labor-law, pay-entity, break, overtime, or jurisdiction implementations into this project.

## Commands

```powershell
pnpm.cmd install
pnpm.cmd supabase:start
pnpm.cmd supabase:reset
pnpm.cmd typecheck
pnpm.cmd test
pnpm.cmd test:db
pnpm.cmd lint
pnpm.cmd build
pnpm.cmd dev
```

Local Supabase uses ports `55321`-`55329` so it can run beside the read-only
Organizer reference stack. The reproducible synthetic account is
`owner@newfork.test`; its local-only password is documented in `supabase/seed.sql`.

Phase 10 evidence and production-unverified boundaries are recorded in
[`docs/rebuild/phase-10-verification-readiness.md`](docs/rebuild/phase-10-verification-readiness.md).
The Schedule visual and bundle follow-up is recorded in
[`docs/rebuild/phase-10a-local-acceptance-closure.md`](docs/rebuild/phase-10a-local-acceptance-closure.md).
The approved blank-slate Time Entries and Employee Time Tracking product contract is recorded
in [`docs/rebuild/phase-11-time-capture-product-definition.md`](docs/rebuild/phase-11-time-capture-product-definition.md).
The locally verified append-only Time foundation is recorded in
[`docs/rebuild/phase-11a-time-capture-foundation.md`](docs/rebuild/phase-11a-time-capture-foundation.md).
The locally verified employee Time Tracking API and responsive UI are recorded in
[`docs/rebuild/phase-11b-employee-time-capture.md`](docs/rebuild/phase-11b-employee-time-capture.md).
The locally verified manager Time Entries API and responsive UI are recorded in
[`docs/rebuild/phase-11c-manager-time-entries.md`](docs/rebuild/phase-11c-manager-time-entries.md).
The locally verified employee correction, manager decision, review-window, and notification flow
is recorded in
[`docs/rebuild/phase-11d-corrections-review.md`](docs/rebuild/phase-11d-corrections-review.md).
The approved blank-slate shared-device kiosk contract is recorded in
[`docs/rebuild/phase-12-kiosk-product-definition.md`](docs/rebuild/phase-12-kiosk-product-definition.md).
The locally verified device enrollment, credential, PIN, throttling, and audit foundation is
recorded in
[`docs/rebuild/phase-12a-kiosk-security-foundation.md`](docs/rebuild/phase-12a-kiosk-security-foundation.md).
The locally verified kiosk online capture and manager controls are recorded in
[`docs/rebuild/phase-12b-kiosk-online-capture.md`](docs/rebuild/phase-12b-kiosk-online-capture.md)
and
[`docs/rebuild/phase-12c-kiosk-manager-controls.md`](docs/rebuild/phase-12c-kiosk-manager-controls.md).
The non-implementation kiosk deployment research and customer-discovery gate are recorded in
[`docs/rebuild/phase-12d-kiosk-deployment-research.md`](docs/rebuild/phase-12d-kiosk-deployment-research.md).
The drafted payroll-readiness checkpoint is recorded in
[`docs/rebuild/phase-13-payroll-readiness-product-definition.md`](docs/rebuild/phase-13-payroll-readiness-product-definition.md).

Phase 13A export snapshot foundation is the recommended next implementation slice only after
explicit approval. Kiosk discovery, managed-device integration, offline capture, payroll provider
integration, pay entities, and compliance logic remain separate approval decisions.
