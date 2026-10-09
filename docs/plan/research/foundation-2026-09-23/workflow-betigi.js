export const meta = {
  name: 'foundation-decision',
  description: 'Verify coworker claims, measure authz sprawl, and decide consolidate vs rebuild of the DB/RLS/backend foundation',
  phases: [
    { title: 'Measure', detail: '6 read-only investigations of the authorization foundation' },
    { title: 'Advocate', detail: '3 advocates argue consolidate / core-rebuild / full-rebuild' },
    { title: 'Judge', detail: '3 lens-specific judges score all options' },
    { title: 'Synthesize', detail: 'Turkish decision report + completeness critic' },
  ],
}

const CTX = args.context

const RULES = `
HARD RULES (non-negotiable):
- READ-ONLY. Do not edit, create or delete any file inside the repo C:/Users/TheWe/Documents/Codex/newfork-clean. No git writes (no commit/checkout/stash/branch/reset). Do not apply migrations. Never run supabase db reset. Do not run the full test suite (no "supabase test db").
- The local Postgres (container supabase_db_newfork-clean) is SHARED with other sessions. Any experiment MUST be a single psql session whose FIRST statement is "begin;" and LAST statement is "rollback;", e.g. { echo "begin;"; cat my.sql; echo "rollback;"; } | docker exec -i supabase_db_newfork-clean psql -U postgres -d postgres -q -At . Never use \\i to include files, never COMMIT, never use fixed UUIDs that could collide with real rows (use gen_random_uuid()). After any experiment, verify nothing leaked: select count(*) from public.workspaces; must stay 7 and auth.users must not gain rows. A previous agent leaked a workspace named "FX" (id e0000000-0000-4000-8000-000000000001) and 4 users fx-*@example.test — it is known; do NOT touch or delete it; exclude it from counts.
- Single pgTAP file runs are allowed: docker exec -i supabase_db_newfork-clean psql -U postgres -d postgres -q -At < supabase/tests/<name>.test.sql
- Prefer reading code and pg_get_functiondef / pg_policies / information_schema over experiments. Distinguish clearly "verified by reading code", "verified by experiment", "not verified".
- Windows + Git Bash. Repo main at commit cf7dff4.
`

const FINDINGS = {
  type: 'object',
  properties: {
    area: { type: 'string' },
    claims_checked: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          claim: { type: 'string' },
          verdict: { type: 'string', enum: ['confirmed', 'refuted', 'partially_true', 'not_verified'] },
          evidence: { type: 'string' },
          how_verified: { type: 'string', enum: ['code_reading', 'experiment', 'both', 'none'] },
        },
        required: ['claim', 'verdict', 'evidence', 'how_verified'],
      },
    },
    key_numbers: { type: 'array', items: { type: 'object', properties: { metric: { type: 'string' }, value: { type: 'string' }, source: { type: 'string' } }, required: ['metric', 'value', 'source'] } },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          detail: { type: 'string' },
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
          foundational: { type: 'boolean', description: 'true if this is a flaw in the foundation (schema/model) rather than in duplicated/unfinished code on top of it' },
          fix_shape: { type: 'string' },
        },
        required: ['title', 'detail', 'severity', 'foundational', 'fix_shape'],
      },
    },
    implications_for_decision: { type: 'string', description: 'What this area implies for: consolidate in place vs rebuild authorization core vs full rebuild' },
    summary: { type: 'string' },
  },
  required: ['area', 'claims_checked', 'key_numbers', 'findings', 'implications_for_decision', 'summary'],
}

const MEASURES = [
  { key: 'jwt-provenance', prompt: `Area: IDENTITY PROVENANCE. The coworker wrote: "actor_user_id değerinin server tarafında JWT'den alındığını repoda ayrıca doğrulamak gerekiyor. Tüm güvenlik bu varsayıma dayanıyor."
Trace end to end how the acting user's identity reaches the database:
1. apps/api: every route (Fastify, apps/api/src/**/*-routes.ts, app.ts) — how is the user resolved (authorize(), contextResolver, createResolverFromEnvironment, supabase auth.getUser, development identity)? List any route where an actor/user id could come from the request body, params, query or headers other than a verified bearer token. Check allowDevelopmentIdentity / createDevelopmentWorkspaceContextResolver and whether production (NODE_ENV=production, api/index.js sets allowDevelopmentIdentity:false) can ever use it.
2. How services call DB: rpc("..._service", { actor_user_id: ... }) — is the value always the resolved context user? Grep all rpc calls passing actor ids.
3. DB side: which SECURITY DEFINER functions take an actor/user id parameter; to which roles are they granted (service_role only? authenticated? anon?). Query pg_proc + has_function_privilege for authenticated/anon on every function whose args include actor/user uuid. Any function callable by a browser that trusts a caller-supplied actor id is a critical hole.
4. Direct browser access: apps/web supabase client .from()/.rpc() usage — which tables/functions the browser hits directly and whether RLS uses auth.uid().
5. The known exception: read_role_workspace (browser rpc). Any others?
Conclude: is the "actor comes from verified JWT" assumption true everywhere? Enumerate exceptions with file:line.` },
  { key: 'authz-census', prompt: `Area: AUTHORIZATION LOGIC CENSUS. The coworker wrote: "lokasyon kontrolü 10'dan fazla fonksiyonda ayrı ayrı yazılmış ve bu kopyalar birbirinden farklı. Örnek: belge engeli olan bir manager lokasyonu göremiyor ama aynı lokasyonda shift yazabiliyor." and "Lokasyon NULL geldiğinde kontrolün geçmesi, erişimi açık bırakan bir risk." and the proposed solution "bu kontrolleri tek bir authorize() fonksiyonunda toplamak".
Do a census of ALL authorization decision logic in the database (public + app_private schemas): permission helpers (workspace_has_permission, service_actor_has_permission, schedule_actor_has_capability_service, schedule_actor_can_publish_service, can_access_location, can_access_employee, can_manage_employee_record, service_actor_can_access_employee, is_workspace_member, workspace_role_for, workspace_allows_interactive_access, document restriction helpers, etc.) AND inline checks inside functions (role in ('owner','admin','manager'), access_class =, all_locations, membership_location_scopes joins, auth.uid() comparisons). Use pg_proc/pg_get_functiondef text search to count occurrences. Produce: (a) list of distinct scope/permission implementations and how they differ (NULL handling, document restriction handling, suspended/pending membership handling, all_locations handling, employee-class-only visibility, self-actions); (b) how many functions contain inline role/scope logic instead of calling a helper; (c) verify the coworker's two examples (document-blocked manager: location invisible but shift writable; NULL location passes) with code evidence and, if cheap, a rolled-back experiment; (d) sketch what a single authorize(actor, workspace, action, target) API would need to cover (actions × target kinds) based on what exists. Also cross-reference the BL-070 research reports in docs/plan/research/bl070-2026-09-23 (A-roller-guvenlik.md, G-kapsam-modeli.md) for already-found inconsistencies; do not redo them, cite them.` },
  { key: 'rls-audit', prompt: `Area: RLS AND POLICY AUDIT. The coworker wrote: "Tüm tablolarda RLS açık. Çoğu tablo doğrudan erişime kapalı, erişim sadece servis fonksiyonlarından geçiyor." and "Doğrudan okuma policy'lerinin bir kısmı sadece 'workspace üyesi mi' diye bakıyor. Örneğin important_dates tablosunda location_ids alanı var ama okuma policy'si lokasyona bakmıyor." and "202 foreign key'in 191'i workspace_id ile birlikte kurulmuş" and "11 foreign key tek kolonlu ... workspace_memberships → employee_profiles ve employee_preferred_name_requests → employee_profiles".
For every table in schema public: RLS enabled/forced? policies (pg_policies: cmd, roles, qual, with_check), table grants to anon/authenticated. Classify each table: (1) no direct client access, (2) direct access gated by membership only, (3) gated by permission, (4) gated by location scope, (5) other. Flag: tables with location columns (location_id, location_ids) whose policies ignore location; policies using helpers that differ from the service-layer checks; tables readable by anon; grants that promise access the policy can never allow (SEC-002 pattern). Cross-check with the web app: which tables the browser reads directly via supabase .from() (apps/web/src) — those are where RLS actually matters today. Verify the FK numbers (202/191/11) and whether any trigger protects the 11 single-column FKs (the BL-070 research A report says the DB accepts a cross-tenant link — cite docs/plan/research/bl070-2026-09-23/A-roller-guvenlik.md). Report counts per class and the concrete risky tables.` },
  { key: 'role-duality', prompt: `Area: ROLE SOURCE OF TRUTH. The coworker wrote: "rol iki yerden okunuyor. Bazı fonksiyonlar membership.role alanına, bazıları role.access_class alanına bakıyor. Şu an bu ikisi arasında uyuşmazlık yok (0 satır) ve bir trigger bunları senkron tutuyor. Ama iki kaynaktan okumak ileride kayma riski demek." and "Veritabanında hiç manager kaydı yok. En karmaşık senaryo gerçek veriyle hiç denenmemiş."
Measure: count DB functions/policies reading workspace_memberships.role vs workspace_roles.access_class vs permission tables (workspace_role_permissions); the sync trigger(s) (e.g. a_sync_membership_role_reference_trigger) and every path that can change either side; scenarios where they can drift (custom roles, owner transfer, role deletion/reassignment, invitation acceptance, suspended/pending). Check whether the API/web read role from one or the other (apps/api, apps/web context.membership.role, access_class). Verify "no manager rows in the database" (exclude the leaked FX workspace) and what fixtures/seed exist for managers (supabase/seed.sql, supabase/local-fixture). Recommend a single source of truth and what it would take.` },
  { key: 'test-infra', prompt: `Area: TEST INFRASTRUCTURE. The coworker wrote: "Test güvencesi: Yetki matrisi testi yok, manager verisi yok" and the solution "bir yetki matrisi testi eklemek". The owner complains tests don't stay in step with decisions.
Assess: pgTAP suite (supabase/tests, 131 files, 38 red at baseline — see docs/plan/research/bl070-2026-09-23/README.md and baseline-kirmizi-38.txt): fixture strategy (each file builds its own fixture? depends on seed? fixed UUIDs? date-dependent — BL-094), average size, how many assert implementation details (function source text, exact error codes/messages, magic counts) vs behavior; CI coverage (.github/workflows/ci.yml has no DB job); vitest API/web tests that mock the DB. Then design concretely an AUTHORIZATION MATRIX test: roles (owner/admin/manager/employee + custom narrowed manager) × scope situations (own location, other location, multi-location employee, no location, suspended/pending, other tenant) × actions (read/write per domain: schedule, availability, time off, exchanges, employees, documents, settings, notifications) with expected allow/deny derived from the owner's target model (docs/plan/research/bl070-2026-09-23/BRIEF.md) — as a table-driven pgTAP generator. Estimate how many existing scattered checks it would replace and how it would keep tests aligned with decisions (single table of expectations). Also state what it cannot catch.` },
  { key: 'rebuild-inventory', prompt: `Area: REBUILD COST INVENTORY. The owner asks whether to rebuild the database/RLS/policy/backend foundation from scratch and build on it. There is no live data and no production users (data migration cost is zero), the owner is a solo developer working with AI agents.
Inventory precisely: number of public tables, app_private objects, functions (by schema, security definer count), triggers, policies, enums, migrations (count/lines), pgTAP files/checks, API routes (count by prefix), API service modules, web data modules (apps/web/src/**/*-data.ts) and how tightly the web is coupled to DB/RPC shapes (packages/shared zod schemas). Classify the foundation into: (1) domain model tables that are sound and would be recreated nearly identically, (2) authorization plumbing (helpers, policies, grants, triggers), (3) half-finished or legacy parallel systems (e.g. two availability systems, legacy shift change requests vs Shift Hub, legacy onboarding availability table, kiosk/time tracking out of MVP scope), (4) accumulated legacy tolerance code. Estimate for each class what a full rebuild would redo versus a targeted rebuild of class (2)+(3)+(4) with a migration squash into a fresh baseline. Give effort ranges (person-weeks for a solo dev with AI help) with explicit assumptions, and list the hidden costs of a full rebuild (re-deriving thousands of decided behaviors, re-testing, UI rework, regressions, the "second-system effect"). Use the BL-070 research (docs/plan/research/bl070-2026-09-23) as evidence of what kinds of bugs occurred and whether each would have been prevented by a rebuild.` },
]

phase('Measure')
const measured = (await parallel(MEASURES.map(m => () =>
  agent(`${CTX}\n\n${RULES}\n\n${m.prompt}\n\nReturn the structured result. Be concrete: file paths, function names, counts, and quote evidence.`,
    { label: `measure:${m.key}`, phase: 'Measure', schema: FINDINGS })
))).filter(Boolean)
log(`Measure: ${measured.length}/${MEASURES.length} areas returned`)

const EVIDENCE = JSON.stringify(measured, null, 1)

const OPTION = {
  type: 'object',
  properties: {
    option: { type: 'string' },
    thesis: { type: 'string' },
    what_it_fixes: { type: 'array', items: { type: 'string' } },
    what_it_does_not_fix: { type: 'array', items: { type: 'string' } },
    plan_steps: { type: 'array', items: { type: 'object', properties: { step: { type: 'string' }, effort_weeks: { type: 'string' }, exit_criteria: { type: 'string' } }, required: ['step', 'effort_weeks', 'exit_criteria'] } },
    total_effort_range_weeks: { type: 'string' },
    risks: { type: 'array', items: { type: 'string' } },
    strongest_argument_against_self: { type: 'string' },
    evidence_refs: { type: 'array', items: { type: 'string' } },
  },
  required: ['option', 'thesis', 'what_it_fixes', 'what_it_does_not_fix', 'plan_steps', 'total_effort_range_weeks', 'risks', 'strongest_argument_against_self', 'evidence_refs'],
}

const OPTIONS = [
  { key: 'A-consolidate', brief: 'OPTION A — CONSOLIDATE IN PLACE: keep the schema and functions; introduce one authorization core (single authorize()/scope function family) and route every check through it; delete duplicate inline checks; add the authorization matrix test; fix the verified bugs; finish or delete half-migrations only where they block.' },
  { key: 'B-core-rebuild', brief: 'OPTION B — REBUILD THE AUTHORIZATION CORE + CLEAN FOUNDATION (strangler): keep the sound domain tables; rebuild authorization (roles single source of truth, scope model chosen by the owner — e.g. G report model M2 —, one authorize(), policies regenerated from a declared matrix), remove parallel/legacy systems (old availability, legacy requests flow, legacy tolerances), squash 319 migrations into a fresh baseline (no live data), then migrate domains one at a time behind the matrix test.' },
  { key: 'C-full-rebuild', brief: 'OPTION C — FULL REBUILD FROM SCRATCH: design a new database/RLS/policy/backend foundation from zero using the lessons learned, then rebuild API and adapt the web app on top of it.' },
]

phase('Advocate')
const advocated = (await parallel(OPTIONS.map(o => () =>
  agent(`${CTX}\n\n${RULES}\n\nYou are the ADVOCATE for this option. Make the strongest HONEST case for it using the measured evidence below; do not invent facts; where evidence is missing say so. You may read the repo and the research reports to strengthen or check your case (read-only).\n\n${o.brief}\n\nMEASURED EVIDENCE (JSON from 6 investigations):\n${EVIDENCE}\n\nReturn the structured result. Effort in weeks for a solo developer working with AI agents; state assumptions inside the steps.`,
    { label: `advocate:${o.key}`, phase: 'Advocate', schema: OPTION })
))).filter(Boolean)
log(`Advocate: ${advocated.length}/3 options argued`)

const VERDICT = {
  type: 'object',
  properties: {
    lens: { type: 'string' },
    scores: { type: 'array', items: { type: 'object', properties: { option: { type: 'string' }, score_1_to_10: { type: 'number' }, reasoning: { type: 'string' } }, required: ['option', 'score_1_to_10', 'reasoning'] } },
    winner: { type: 'string' },
    conditions_that_would_change_winner: { type: 'string' },
    doubts_about_evidence: { type: 'string' },
  },
  required: ['lens', 'scores', 'winner', 'conditions_that_would_change_winner', 'doubts_about_evidence'],
}

const LENSES = [
  { key: 'security', text: 'SECURITY AND CORRECTNESS: which option most reliably makes tenant isolation, role and location-scope decisions correct and provably tested (authorization matrix), and removes classes of bugs rather than instances?' },
  { key: 'delivery', text: 'DELIVERY RISK FOR A SOLO DEVELOPER: which option gets to a sellable MVP soonest with the least risk of stalling, regressions, second-system effect and lost decided behavior? Consider that there is no live data.' },
  { key: 'maintainability', text: 'LONG-TERM MAINTAINABILITY: which option leaves a codebase where tests stay aligned with decisions, a rule is written once, new features (UI employee→admin flows, eligibility criteria) are cheap to add correctly?' },
]

phase('Judge')
const judged = (await parallel(LENSES.map(l => () =>
  agent(`${CTX}\n\nYou are a JUDGE with one lens: ${l.text}\nScore all three options 1-10 strictly through your lens. Be skeptical of advocates: check their claims against the measured evidence; penalize unsupported effort estimates.\n\nMEASURED EVIDENCE:\n${EVIDENCE}\n\nADVOCATE CASES:\n${JSON.stringify(advocated, null, 1)}`,
    { label: `judge:${l.key}`, phase: 'Judge', schema: VERDICT })
))).filter(Boolean)
log(`Judge: ${judged.length}/3 verdicts`)

phase('Synthesize')
const report = await agent(`${CTX}\n\nWrite the final DECISION REPORT in TURKISH for the owner (a solo developer; reads plain language; every technical name gets a one-line human anchor: where in the app, what it does for a person, a concrete example). Structure:
1. Kısa cevap (3-5 cümle): kısır döngüde miyiz, temel mi çürük, sıfırdan kurmak mı toparlamak mı — net öneri.
2. İş arkadaşının yorumu: her iddia için doğru/yanlış/kısmen + kanıt (tablo). Özellikle JWT/actor iddiasının sonucu.
3. Bugünkü sorunların kaynağı: kaç tanesi temel (şema/model) hatası, kaç tanesi tekrar eden kural / yarım geçiş / arayüz boşluğu — sayılarla.
4. Üç seçenek karşılaştırması (tablo: ne düzeltir, ne düzeltmez, süre aralığı, risk) + hakem puanları.
5. Önerilen yol: aşamalar (her aşamanın bitiş kriteri), ilk 2 haftada ne yapılır, neyi bekletir; rol/kapsam modeli kararı (M2 vb.) ve yetki matrisi testinin yeri.
6. Önerinin değişeceği koşullar (hangi bulgu çıkarsa sıfırdan kurmak doğru olur).
7. Sahibe karar soruları (seçenekli, önerili, gerekçeli).
Be honest about uncertainty; mark what was verified by experiment vs code reading vs not verified.

MEASURED EVIDENCE:\n${EVIDENCE}\n\nADVOCATE CASES:\n${JSON.stringify(advocated, null, 1)}\n\nJUDGE VERDICTS:\n${JSON.stringify(judged, null, 1)}`,
  { label: 'synthesize:report', phase: 'Synthesize' })

const critique = await agent(`${CTX}\n\nYou are a COMPLETENESS CRITIC. Read the decision report below and the evidence. List concretely: claims in the report not supported by the evidence, important evidence the report ignored, questions the owner asked that the report does not answer (the owner asked: kısır döngüde miyiz; mimari/izin kararları çıkmaza mı soktu; sadece yama mı yapıyoruz; sıfırdan temel kurmak daha mı iyi; plus the coworker's claims), and any overconfident effort numbers. Be brief and specific. If the report is sound, say so.\n\nREPORT:\n${report}\n\nEVIDENCE:\n${EVIDENCE}\n\nJUDGES:\n${JSON.stringify(judged, null, 1)}`,
  { label: 'synthesize:critic', phase: 'Synthesize' })

return { measured, advocated, judged, report, critique }
