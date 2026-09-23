**Verdict:** The report's direction (keep the domain tables, rebuild the authorization core, gate with CI and the matrix, delete the parallel systems) matches the evidence. Most per-claim numbers trace back to the investigations. It still has internal contradictions, some claims that go beyond the evidence, and plan gaps that should be fixed before the owner sees it.

## 1. Claims the evidence does not support, or contradicts
- **"Kısır döngü var, ama kaynağı mimari değil" (section 1).** The rebuild-cost inventory says outright that class 2 (authorization) "is where the foundation is actually flawed". It lists two identity channels, 45 claim bridges and 16 scope implementations as `foundational: true`. The census and the RLS audit also mark the draft/session container and the duplicated rule as foundational. A fair headline would be: the data model is sound, but the permission architecture (the half-finished switch of 8 September) is a foundation-level flaw. That is exactly the owner's question.
- **Section 6, condition 4: "veri modelinde işletmeler arası ayrım delinirse… Bugün ikisi de bulunmadı."** This contradicts the report's own #4 and the RLS finding rated high. An admin, from the browser, linked a membership to another workspace's employee record, and that is tenant isolation broken at the data level. It is cheap to fix, but it was found.
- **Section 3: "D3 ve rütbe kuralı hiçbir kopyada yok."** The census says rank checks do exist, in `can_manage_employee_record` and `can_edit_role`. They are missing from the other copies.
- **"Kodun yarısı zaten M2'ye uyuyor" / "okuma hücreleri M2 ile birebir".** This rests on about 3 read cells (Ali, Emre, Veli) in the prototype. The same prototype found a D3 violation on terminate. "Half the code" is an extrapolation.
- **"M3'e ya da M4'e geçmek… yalnız o satırları değiştirir."** `expected()` is the test's specification, not the implementation. Changing the model also changes `authorize()`. M2 itself needs schema changes (the time-off location, per-location votes). The same paragraph then says M4 "sonradan geri getirmek pahalıdır", which contradicts "only lines change". The claim that M4 "simplifies the code most" was never measured.
- **"Aşama 4'ün sonu: kural tek yerdedir."** Moving the domains onto the core (45 bridges, 51 inline functions, 12 helpers) happens in stage 6. At the end of stage 4 the rule is still in many places.
- **"Her aşama tek başına yayınlanabilir… geride tutarlı bir sistem kalır."** Stage 6 is domain by domain, so stopping midway leaves old and new styles side by side. That is the 8 September failure mode, and the report itself calls it the main risk.
- **"Bilinen güvenlik açıkları… ilk 2 haftada kapanır."** Several are not scheduled in weeks 1–2:
  - the realtime public channels, which are in no stage at all
  - E2 NULL-location (stage 4)
  - E3 `important_dates` read
  - employees reading every membership row across locations
  - E4 suspended-workspace writes to `locations`, which stay open because the 7 settings tables stay open
- **Two-week timing is inconsistent.** "İlk 2 hafta" packs stages 0–2 into 2 weeks, but the stage table gives 2.5–4 weeks, and the "durma noktası" also says 2.5–4.
- **"Tetikleyici ertelemeli olduğu için testlerde hiç çalışmıyor."** The evidence says 9 files force `set constraints all immediate` and 2 test the real derivation.
- **"57'si ürünün oluşturamayacağı manager."** The 17 manager files with no scope may be creatable today; a manager with no location is still an open G question.
- **#4 verdict "Doğru".** The coworker said 11 single-column links; the evidence says 9 plus 2 two-column, so the verdict should be "Kısmen". "Admin bunu tarayıcıdan da yapabildi" applies only to the membership link. The preferred-name cross-tenant case was tested as postgres.
- **Q3: "10 Eylül'de gerekçesiz eklendi".** D1 shows the reason was latency (commit `100c882`, "Schedule read latency quick fix"). Reverting has a known speed cost that needs measuring, and the report leaves it out.
- **Not in the supplied evidence:** "MVP… 5–8 hafta geç" for C against A/B. The inventory ranges imply about 3–7. "Hosted'da 2 işletme ve 3 çalışan" also has no source.

## 2. Evidence the report ignored
- **Gen-3 counterpoint.** Two judges verified that the first CI only arrived on 16 September (`77d5c38`) and never ran pgTAP, so Gen 3 was an ungated port. That weakens "rebuilding does not work" as a general rule. The report presents the precedent without it.
- **Judge 1's condition for choosing B.** Judge 1 picked B only if `authorize()`'s "NULL location = deny" rule is folded into step 1. B′ leaves it in stage 4, so "üç hakemden ikisi" is only conditionally true.
- **Judge 2's main objection: the MVP pause.** B′ stops new features for 10–17 weeks and the report never states that duration for B′. The 22 vs 21 judge total is effectively a tie on unweighted lenses. Delivery gave A 8 and B 6.
- **Manager scope as a view** over the manager's own assignments (test-infra, Judge 1, Judge 3). It removes both the deferred-sync bug class and the fake-fixture class. The report never mentions it and instead forces the deferred triggers in the fixture.
- **Changing how "no" is returned breaks screens.** Stage 4 (one 42501, returned before validation) replaces today's NULL and P0002 responses, and Judge 2 flagged that screens expecting those will break. That conflicts with "veri şekilleri sabit kalır / web yalnız bilerek değişen ekranlarda", and the web work is not budgeted.
- **Employees see every location.** `all_locations=true` is set on 5 of 6 employee memberships, and `can_access_location` has no role-class filter, so employees pass location checks everywhere.
- **Entry points with no check.** 41 `*_service` entry points have no membership, role or scope check (ownership-based). The matrix coverage sweep has to classify them.
- **`read_role_workspace` and a false-green test.** It is a browser-callable SECURITY DEFINER function, and `function_execute_privileges` is red because of it. The vitest migration-regex test is green while the property is broken. With a "green files only" CI gate, this guard would not run.
- **Cron and idempotency.** The cron-secret helper is copy-pasted 4 times with a non-constant-time compare. Idempotency keys on 4 tables are not scoped to the actor.
- **Scheduled export.** "Always fails" was found by experiment but "not observed in a running app". It is also not assigned to any stage.
- **Date-bound tests.** 2 test files have November 2026 dates that expire during the program.

## 3. Owner questions not fully answered
- **"Did early architecture or permission decisions lead us into a dead end?"** The report never names which early decisions were wrong. The evidence points to five:
  1. starting with browser access through PostgREST under RLS, then only half switching to API plus `service_role`
  2. drafts, locks and sessions as one container per workspace and week
  3. a single time-off location chosen by the employee
  4. manager scope as a synced table fed by deferred triggers
  5. role stored twice

  The owner asked for exactly this list.
- **Employee UI to admin UI with role checks on read and write.** The matrix cannot see the web gates (64 permission checks, 10 route guards, 31 API checks), and the report defers the web helper with no stage or estimate. This difficulty stays mostly unsolved, and the table should say so plainly.
- **Eligibility (location, job, availability).** A "second matrix" is mentioned but is in no stage and not in the 10–17 estimate.
- **Q2 sets G's 2–12 recommendations as defaults with opt-out.** That conflicts with the owner's standing rule to ask where there is more than one reading and never assume.

## 4. Overconfident effort numbers
- **The 10–17 in section 1 carries no caveat.** None of the estimates comes from a timed slice.
- **Stage 0 (0.5 week)** covers 11+ decisions (M2, G 2–12, D1, BL-091, Shift Hub, kiosk, employee view) in a report whose thesis is that decisions are the bottleneck.
- **Stage 6 (3–5 weeks)** covers 8 domains, 45 bridges to 0, moving Settings writes to the API (rewiring the web's `organization-data.ts`), D4 time-off votes (1–2 weeks alone per the inventory), D3, rank, the approved-time-off constraint, preferred-name recipients, BL-092, the employee view, enabling Shift Hub, manager terminate, and 31 red tests. The inventory's M2 edits alone are 1.5–3 weeks, so this stage is understated.
- **Matrix scaling (5–20 s)** is labelled unverified, which is correct, but "yaklaşık 60 satır" for `expected()` is stated as fact.