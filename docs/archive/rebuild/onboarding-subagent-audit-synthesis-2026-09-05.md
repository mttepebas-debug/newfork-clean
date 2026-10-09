# Onboarding Planı Subagent Audit Sentezi

Durum: 2026-09-04 tarihinde yarıda kesilen audit çalışmasının readonly sentezi.

İncelenen ana plan:
`docs/archive/rebuild/onboarding-reference-audit-spec-inventory-roadmap-2026-09-04.md`

Bu dosya ana planı değiştirmez. Kurtarılan sibling/subagent çıktısını ve açık
soruları kaydeder; bir sonraki brainstorming turunda hangi bulguların plana
kilitleneceğine karar vermek için kullanılır.

## Kurtarma Kapsamı

Yerel Codex session loglarından kurtarıldı:
`C:/Users/TheWe/.codex/sessions/2026/09/04`

Yarıda kesilen çalışma birkaç katman oluşturmuştu:

- Sibling audit task oluşturmayı deneyen root/coordination sessionları.
- Bu create-thread aksiyonları için guardian/approval sessionları.
- Bazıları tamamlanan, bazıları analiz ortasında duran gerçek readonly audit
  sessionları.
- Assistant çıktısı olmayan birkaç boş session.

## Tamamlanmış Ya Da Anlamlı Audit Bulguları

### Roller, Ownerlık Ve Lifecycle

Kaynak session: `01a06baf-0e77-77f2-819c-1fddebcdeffd`

Bulgular:

- Primary-owner invariant eksik tanımlanmış. Plan tam olarak bir primary owner
  kilitliyor, fakat mevcut kanıt sadece son aktif owner'ın kaldırılmasını
  engelliyor. Spec aynı zamanda iki aktif primary owner oluşmasını da
  engellemelidir.
- Aktif primary owner'ın employee kaydı korunmalıdır. Kabul edilmiş ownership
  transfer veya organization closure dışında archive, terminate, revoke, suspend
  veya unlink edilememelidir.
- Manager suspend yetkisi full organization access suspension anlamına geliyorsa
  fazla geniş. Shared-location employee için scoped manager kendi kapsamı dışına
  taşan erişimi kapatabilir. Manager aksiyonu scoped work restriction mı,
  escalation request mi, yoksa yalnız owner/admin suspend işlemi mi olacak karar
  verilmelidir.
- Manager approval, resend ve revoke kurallarında target-role check eksik.
  Manager yetkisi yalnız assigned location içindeki employee-role userlar için
  geçerli olmalı ve commit time'da tekrar doğrulanmalıdır.
- "One role per membership" ifadesi, mevcut built-in access class / custom-role
  kavramlarını koruyarak membership başına tek assigned role object olarak
  yazılmalıdır.

Önerilen spec değişiklikleri:

- Privileged lifecycle invariants bölümü ekle.
- Her aktif organization için tam olarak bir aktif primary owner transactional
  garantisini ekle.
- Owner employee record korumalarını açıkça ekle.
- Manager lifecycle target-role ve location-scope checklerini ekle.

### Tenant Context, Switcher Ve Projection

Kaynaklar:
`01a06baf-7f51-7cf1-8a34-53b1c94cd8e5`,
`01a06bb0-8eff-7f53-9fb9-32004f4b581d`

Bulgular:

- Switcher projection fazla geniş. Pending, suspended ve active organizationlar
  için ayrı visible field allowlistleri gerekiyor. Pending/suspended state'ler
  notification count, todo count, document detail, schedule signal veya hassas
  reason text sızdırmamalı.
- Tab-scoped tenant context kilitli ama implement edilebilir seviyede değil.
  Plan API call'ları için canonical tenant binding'i ve URL, header, body, local
  cache, default preference uyuşmazlığında ne olacağını tanımlamalıdır.
- Draft owner setup normal tenant gibi görünmemeli. Draft organization ve owner
  link için default seçilemeyen, normal app surface'e giremeyen,
  export/job/notification yüzeylerinde görünmeyen setup-only state gerekir.
- Audit visibility cross-tenant oracle olabilir. Tenant-visible audit row'ları
  denenmiş foreign resource ID, foreign organization data, başka tenantlardan
  masked email veya "resource exists elsewhere" sinyali göstermemelidir.
- Async job, export, notification ve delayed task'lar execution-time authorization
  check yapmalı: actor, requester, recipient, membership status, role/location
  scope, organization lifecycle ve storage access.
- Schedule, document, todo, notification, export, audit ve onboarding için
  organization-aware constraint matrix gerekir.
- Generic 404 davranışı response shape, pagination, batch error, mümkün olduğu
  kadar timing, redirect behavior, export filename ve notification payload
  kapsamına alınmalıdır.

Önerilen spec değişiklikleri:

- Tenant context contract ekle: canonical org source, URL shape, header/body
  agreement, tab storage key'leri, query-key formatı, realtime channel naming,
  cancellation behavior ve failure mode.
- Switcher, invitation preview, pending onboarding card, suspended screen,
  notification badge ve audit row için projection allowlist ekle.
- Composite ownership matrix ve two-tenant negative testleri ekle.

### Dokümanlar, Acknowledgement, Review Ve Compliance

Kaynaklar:
`01a06baf-94d0-7cf3-8e91-70a145637b09`,
`01a06bb1-0106-73c1-b23d-fbfad908c1f5`

Bulgular:

- Manual review independence belirtilmemiş. Plan self-review'u yasaklamalı ve
  admin/manager onboarding ile document approval için peer review mümkün mü
  tanımlamalıdır.
- Acknowledgement'lar dokümanlara göre eksik tanımlanmış. Evidence record,
  policy text versioning, re-acknowledgement trigger ve acknowledgement expire
  olabilir mi veya schedule'ı etkiler mi soruları netleşmelidir.
- Requirement snapshot'lar immutable evidence-grade detaylara ihtiyaç duyuyor:
  requirement ID, version ID, template/policy content version, gerekiyorsa file
  hash, shown text hash, timestamp'ler, reviewer identity ve evidence ID'leri.
- Expiration-impact change'ler onboarding snapshot sınırını override edebilir.
  Pending onboarding case'leri mi, yalnız active employee'leri mi, yoksa ikisini
  de mi etkilediği belirtilmelidir.
- Manager document scope multi-location employee, remote/excluded zero-location
  employee, location change ve org-wide requirement için belirsiz.
- Manager document download için audit, URL expiry/revocation beklentileri ve
  category-level sensitivity limitleri gerekir.
- Manual review / expiration / hard conflict içeren optional document'lar daha
  keskin bir matrise ihtiyaç duyuyor. Optional document conflict yaratabilir mi
  karar verilmelidir.
- Schedule conflict policy için effective dating ve draft pinning gerekiyor. Açık
  Schedule editor, drag plan, draft shift ve republish attempt deterministic
  policy version kullanmalıdır.
- Review-document-from-Schedule akışı için daha güçlü UI preservation contract
  gerekiyor: draft identity, unsaved editor state, drag cancellation, return
  focus, modal/drawer stacking ve stale conflict recalculation.
- Compliance reminder ve conflict request için Todo dedupe/source identity fazla
  zayıf.

Önerilen spec değişiklikleri:

- Review Independence ekle.
- Acknowledgement Requirements ekle.
- Compliance Policy Versioning ekle.
- Manager Document Scope matrix ekle.
- Schedule Conflict Drawer Contract ekle.
- Todo source-key/dedupe kuralını future UX'ten backend contract'a yükselt.

### Billing, Trial, Organization Closure Ve Account Deletion

Kaynak session: `01a06bb0-00b5-7f30-a59f-04ffc74a1621`

Bulgular:

- Owner onboarding trial activation'a bağlı, fakat billing/trial out of scope
  olarak işaretli. Finish şu anda trial activation'ı atomik commit ediyor ve
  invitation dispatch yalnız trial activation sonrası çalışıyor. Onboarding phase
  minimal trial-entitlement contract'a ihtiyaç duyuyor ya da invite dispatch,
  billing/trial fazına kadar billing'den ayrılmalı.
- Trial/payment retention sonrası auto deletion, "yalnız owner organization
  silebilir" kuralıyla çelişiyor. System-scheduled retention deletion kendi
  lifecycle'ına, actor semantics'e, notification'lara, cancellation/payment
  restore kurallarına, export access'e ve tombstone behavior'a ihtiyaç duyuyor.
- Read-only soft lock için role bazlı route/mutation allowlist gerekir. Owner
  billing, export, closure, muhtemelen ownership transfer ve payment restore
  yapabilmeli; admin billing yönetmemeli.
- Ownership-transfer billing behavior daha detaylı olmalı: billing owner, payment
  instrument ownership, renewal warning, grace behavior, invoice'lar ve transfer
  renewal/payment failure'a yakınken bloklanacak mı.
- Immediate deletion/no-refund kilitli ama refund/dispute policy hâlâ TBD. Daha
  güvenli ifade: billing policy veya law gerektirmedikçe automatic in-product
  refund yok.
- Logged-in website üzerinden ikinci business create etmek yapısal olarak mümkün,
  ama exact entry point ve pending-invite behavior gerekir.

Önerilen spec değişiklikleri:

- Minimal Billing Dependency For Onboarding ekle.
- System-Scheduled Retention Deletion ekle.
- Soft-Lock Route/Mutation Allowlist ekle.
- Billing policy finalize edilene kadar no-refund wording'i yumuşat.

### Todo Ve Notifications

Kaynak session: `01a06bb0-08db-7e21-9001-d58ab64c3a97`

Bulgular:

- Todo, notification ve action-center boundary'leri belirsiz. "Add to Todo" her
  notification'ın ima ettiği bir yan etki değil, explicit create/link aksiyonu
  olmalıdır.
- Her automatic source için lifecycle table gerekir: invite, pending onboarding,
  document expiration/rejection, final location removal, account removal request
  ve trial retention.
- Notification preferences catalog class'lara ihtiyaç duyuyor: unmutable
  security/access, mandatory in-app operational, optional email operational ve
  user-mutable categories.
- Email mute etmek required in-app state veya required todo'yu asla kapatmamalı
  veya gizlememeli.
- Two-tenant Todo/notification leakage testleri gerekir.

Önerilen spec değişiklikleri:

- Source-linked Todo identity ve dedupe rules ekle.
- Notification catalog/mutability matrix ekle.
- Source reopen/close, archive reassignment, scoped manager assignment negatives
  ve muted email while in-app/todo remains acceptance testleri ekle.

### Product UX, Owner Wizard, Checklist Ve Employee Landing

Kaynak session: `01a06bb0-2c70-7721-96ff-f2faf2cbf1fd`

Bulgular:

- Four-step owner setup, optional team step manual-only kalırsa yoğun bir
  restoran için hâlâ ağırlaşabilir. Team step için skip for now, küçük manual
  starter set ekleme ve Employees sayfasından devam etme modları gerekir.
- Invalid optional row'ların Finish'i bloklaması user'ı tuzağa düşürebilir.
  Partial optional row yalnız explicit save/add sonrası bloklamalı ya da user
  bunları temiz şekilde discard edebilmelidir.
- Helper checklist immediate post-onboarding guidance olarak tariflenmiş, ama
  roadmap bunu Phase 7'ye koyuyor. Phase 3 minimal shell ve daha sonraki advanced
  checklist olarak ayrılmalı.
- Employee landing page TBD, fakat employee onboarding activation, pending card,
  document/task, availability ve contact sharing minimum bir destination'a bağlı.
- Organization switcher placement TBD, fakat invitation, pending/suspended
  status, default org ve multi-org access için core karar. En azından V1
  placement Phase 2 implementation öncesi çözülmeli.
- Organization creation sonrası empty state'ler screen'lere map edilmemiş: no
  employees, no schedule, no kiosk, no documents, no billing card vb.

Önerilen spec değişiklikleri:

- Restaurant Scale UX subsection ekle.
- Helper checklist shell'i Phase 3'e böl.
- Minimal V1 employee home tanımla.
- V1 switcher placement'i Phase 2 öncesi çöz.
- Empty-state matrix ekle.

## Kısmi Session Sinyalleri

Bu sessionlar complete finding döndürmedi ama işe yarar yön verdi:

- `01a06bb1-0fc8-7493-9904-8f3b3bbd30b2`: mevcut `ProtectedRoute`, planın
  acquisition intent resolution istemesine rağmen no-org user'ları hâlâ
  `Workspace unavailable` ekranına yönlendirebilir. Ayrıca mevcut invite delivery
  davranışında delivery failure'ın prepared invite'ı revoke edebileceğine dair
  sinyal bulundu; bu independent delivery state ile çelişiyor.
- `01a06bb2-6441-7a50-b27c-355d14cf87af`: acceptance criteria aynı user / iki
  org / iki rol için URL, API header/body, realtime channel ve cache key boyunca
  henüz yeterince test edilebilir değil.
- `01a06bb2-644d-72a0-9f20-504bd1264a7f`: mevcut code hâlâ `workspace_id`
  kullanıyor; bu kabul edilebilir, fakat migration/terminology scope explicit
  olmalı. Audit cascade, outbox after-commit, exact-once idempotency ve composite
  foreign key'ler enforceable DDL requirement'a ihtiyaç duyuyor.
- `01a06bb2-650b-7401-a35c-9c3e2f4da571`: mevcut target `active_workspace`
  merkezli görünüyor; routing, cache key, API parameter ve switcher birlikte
  değişirse Phase 2 fazla geniş olabilir.
- `01a06bb2-6560-7db0-9458-dbd6fcdfa1af`: lifecycle summary order checklist ve
  trial sequence konusunda kafa karıştırabilir; alttaki Finish section trial'ın
  Finish'te başladığını söylüyor.
- `01a06bb2-df09-7c92-ad5a-dbb342644c90`: transfer/closure kuralları exact
  transaction/lock/tombstone authority ve soft-lock/deletion interaction'a ihtiyaç
  duyuyor.
- `01a06bb4-71b2-7bb2-b646-ab681a3be4af`: large roster ergonomics, invite
  reissue limitleri, archive/rehire atomic side effect'leri ve employee creation
  schedule-eligibility state daha net contract'lar gerektiriyor.
- `01a06bb4-71f6-7ff0-8b46-ec643836c49c`: lifecycle operation'lar schedule,
  time-entry, access ve history için explicit consequence gerektiriyor.
- `01a06bb4-3a47-7bf2-a24c-3d8d6020507c`: roadmap org-keyed cache/state ve
  tab-scoped context'i implementable requirement ve testlere çevirmeli.
- `01a06bc9-381d-76c0-8f13-7952f4a7eeba`: yalnız startup message kurtarıldı.

## Boş, Guardian Ya Da Coordination Sessionları

Bu sessionlardan audit bulgusu kurtarılamadı:

- `01a06bad-7bfa-7a52-a9d4-e415fbb6b693`
- `01a06bad-8854-7273-9e7a-879ab55f1efe`
- `01a06bad-8891-7c71-b216-2d77c0d9cf54`
- `01a06bad-b615-7ab0-8877-81d6647b2222`
- `01a06bad-b64c-7161-902f-35ab780db268`
- `01a06bad-fe03-7e52-a722-8c00327a6719`
- `01a06bad-fe37-77a0-b0a3-042f2730902a`
- `01a06bae-3e65-7402-87b3-757de06f00f4`
- `01a06bae-3e83-73f2-a6e3-222f3194e68b`
- `01a06bae-8198-7132-8a15-664230520629`
- `01a06bae-81c4-7321-b29e-b06bce0f44ff`
- `01a06bae-ff34-76e3-a77e-63d6edfaa065`
- `01a06bba-b7fc-7741-926a-9ff1f524a051`
- `01a06bcb-9371-7bf0-ac23-0bf25bf57e12`
- `01a06bcb-cdb5-7921-9c78-d2b1800d510e`
- `01a06bce-b0be-7ee2-b595-16a4506e3172`
- `01a06be0-28f5-7f02-a8b1-aac12c569a7e`

Bunların çoğu gerçek audit finding değil, create-thread coordinator veya
guardian approval review sessionlarıydı.

## Brainstorming İçin Konsolide P0/P1 Maddeleri

1. Primary-owner invariant hem sıfır owner'ı hem birden çok primary owner'ı
   engellemelidir.
2. Aktif primary owner'ın employee kaydı normal archive/suspend/revoke/unlink
   flow'larından korunmalıdır.
3. Tenant context contract, URL/header/body/cache/default boyunca canonical org
   binding'i ve mismatch behavior'ı tanımlamalıdır.
4. Switcher/pending/suspended projection'lar tenant state sızıntısını önlemek
   için allowlist'e ihtiyaç duyuyor.
5. Audit log'ları tenant-visible operational audit ile restricted security audit
   olarak ayrılmalıdır.
6. Owner onboarding minimal trial-entitlement dependency contract'a ihtiyaç
   duyuyor veya trial dispatch onboarding implementation'dan ayrılmalıdır.
7. Billing retention deletion, owner-requested organization deletion ile aynı şey
   değil; system lifecycle olmalıdır.
8. Soft lock role-based mutation allowlist'e ihtiyaç duyuyor.
9. Review independence self-review'u yasaklamalı ve manager/admin review
   limitlerini tanımlamalıdır.
10. Acknowledgement'lar first-class versioned evidence olmalıdır.
11. Compliance conflict kuralları policy version/effective-date semantics
    gerektiriyor.
12. Todo/notification/source identity explicit ve tenant-scoped olmalıdır.
13. Employee landing ve switcher placement cosmetic TBD değil; Phase 2/4 için
    implementation clarity bloklarıdır.
14. Owner team step large-roster ergonomics ve safe partial-row behavior'a ihtiyaç
    duyuyor.

## Önerilen Sonraki Denetim Batch'i

Full conversation context fork etmeden ve sibling Codex task oluşturmadan taze
bir 6-agent batch çalıştır:

1. Tenant context ve projection allowlistleri.
2. Owner/role/lifecycle invariantları.
3. Billing/trial/closure/account deletion.
4. Employee identity/invite/onboarding.
5. Documents/Todo/notifications/schedule conflicts.
6. Roadmap/UX buildability ve phase slicing.

## Taze 2026-09-05 Denetim Batch'i

Bu batch önceki session bulguları kurtarıldıktan sonra çalıştırıldı. Tüm
agent'lara readonly kalmaları ve yalnız iki planning dokümanını audit etmeleri
söylendi:

- `docs/archive/rebuild/onboarding-reference-audit-spec-inventory-roadmap-2026-09-04.md`
- `docs/archive/rebuild/onboarding-subagent-audit-synthesis-2026-09-05.md`

### Tamamlanan Agentlar

- `01a07053-689d-7623-81e3-ba5fab47f6a2` tenant context ve projection
  allowlistlerini audit etti.
- `01a07053-77eb-7531-9dfb-a364ddaa99c3` owner, role, manager scope ve lifecycle
  invariantlarını audit etti.
- `01a07053-9f5c-7922-9729-dafcd48a1c27` billing, trial, closure, retention ve
  account deletion'ı audit etti.
- `01a07053-d661-7982-9284-1f8e71556f7d` employee identity, invitation, signup ve
  onboarding lifecycle'ı audit etti.
- `01a07054-155c-7ea3-9243-0e9942b83ca8` document, acknowledgement, Todo,
  notification ve schedule conflict'leri audit etti.
- `01a07054-551c-7691-b888-893f1433f028` product UX, owner wizard, checklist,
  employee landing ve roadmap buildability'yi audit etti.

### Yeni Ya Da Güçlenen P0 Bulgular

1. Canonical tenant binding hâlâ implement edilebilir seviyede değil.
   Plan URL/tab organization, `x-organization-id`, mutation body
   `organization_id`, local cache ve default organization preference
   uyuşmadığında neyin kazanacağını ve neyin fail edeceğini tanımlamalıdır.
   Default organization preference sadece initial route seçebilir; request'i
   authorize veya repair etmemelidir.

2. Switcher ve account-state projection'ları explicit allowlist gerektiriyor.
   Active, pending onboarding, suspended, invitation preview, acquisition ve draft
   owner setup state'leri ayrı data projection'lara ihtiyaç duyuyor.
   Pending/suspended state'ler notification count, Todo count, schedule signal,
   document detail, employee name, audit detail veya sensitive suspension reason
   göstermemelidir.

3. Tenant-visible audit log'lar cross-tenant fact sızdırabilir.
   Owner/admin tarafından görülen operational audit, restricted security audit'ten
   ayrılmalıdır. Foreign ID, masked foreign email ve "resource exists in another
   organization" fact'leri tenant-visible log'larda görünmemelidir.

4. Async job'lar sadece queued org ID değil, execution-time authorization
   gerektiriyor.
   Email, notification, delayed job, export, storage URL, reminder ve outbox retry
   execution time'da organization lifecycle, actor authority, recipient
   membership/status, role/location scope, resource ownership ve storage policy
   tekrar doğrulamalıdır.

5. Primary-owner invariant daha güçlü bir modele ihtiyaç duyuyor.
   V1, active organization başına tam olarak bir `owner` role membership mı
   olacak, yoksa birden fazla owner-role user ve tam olarak bir `primary_owner`
   mı olacak karar vermelidir. Daha güçlü önerilen V1 modeli, active organization
   başına bir active owner-role membership'tir. Promote, demote, restore,
   transfer, suspend, archive, revoke, unlink, delete ve migration path'lerinin
   tamamı tam olarak bir active owner ile bitmelidir.

6. Active owner employee record normal employee lifecycle flow'larından
   korunmalıdır.
   Owner-linked employee record ordinary employee/member action'larıyla archive,
   terminate, suspend, revoke, unlink, delete veya self-left olamaz. İzinli
   çıkışlar accepted ownership transfer, organization closure veya restricted
   platform intervention'dır.

7. Owner-transfer lock eksik.
   Transfer pending iken competing transfer attempt'leri, owner role write'ları,
   owner employee lifecycle write'ları, organization deletion,
   account deletion/removal request'leri ve billing-owner mutation path'leri
   kilitlenmelidir.

8. Trial activation hidden onboarding dependency.
   Plan billing/trial implementation'ı out of scope diyor, fakat Finish 14-day
   trial'ı başlatıyor ve invite dispatch bunu bekliyor. Phase 3 minimal internal
   `trial_entitlement` contract'a ihtiyaç duyar veya invitation'lar sadece
   successful organization setup commit'e bağlı olmalıdır.

9. System retention deletion, ayrı modellenmezse "only owner deletes
   organization" kuralıyla çelişir.
   Expired trial/payment retention purge `system_retention_job` lifecycle'ı
   olmalı; kendi authority, notice, restore window, export window ve purge
   semantic'lerine sahip olmalıdır. Owner-requested deletion gibi
   modellenmemelidir.

10. Soft-lock mode role bazlı route ve mutation allowlist gerektiriyor.
    Owner, admin, manager, employee, system webhook, retention notice, export ve
    purge capability'leri açıkça allow/deny edilmelidir. "Writes disabled"
    implementasyon için fazla geniş.

11. Review independence henüz enforce edilebilir değil.
    Submitter kendi onboarding case, document, acknowledgement, correction veya
    photo'sunu approve/reject/final-approve edememelidir. Peer/higher-role review
    commit time'da role ve location scope check ile tanımlanmalıdır.

12. Manager approval/revoke/suspend authority hâlâ fazla geniş.
    Shared-location employee üzerinde scoped manager organization-wide effect
    yaratabilir. Full membership suspend/revoke ve organization invitation revoke
    owner/admin-only olmalı veya ayrı scoped work restriction flow tasarlanmalıdır.

13. Pending/active lifecycle transition'ları için tek authoritative matrix
    gerekiyor.
    Invitation, membership, onboarding case, employee lifecycle, document review,
    schedule eligibility, suspension, archive, rehire, leave-pending ve account
    deletion state'leri ayrı yerlerde anlatılmış. Implementation için action,
    actor, from-state, to-state, guard, side effect, access/cache invalidation,
    audit/notification ve retry/idempotency içeren tablo gerekir.

14. Schedule conflict policy effective dating ve draft pinning eksik.
    Future shift'leri etkileyen compliance policy change, açık Schedule edit'in
    anlamını beklenmedik şekilde değiştirmemelidir. Draft ve publish attempt'leri
    policy-version pinning ve conflict recalculation rule'larına ihtiyaç duyar.

15. Switcher placement ve employee landing build blocker.
    Şu an TBD, fakat Phase 2/4 routing deterministic switcher home ve minimal
    activated-employee home olmadan temiz implement edilemez.

### Yeni Ya Da Güçlenen P1 Bulgular

1. Generic 404 single resource, pagination, batch error, redirect, pratik olduğu
   ölçüde timing, filename, notification payload ve storage URL boyunca full
   response contract olmalıdır.

2. Two-tenant negative testler URL/header/body mismatch, stale default, stale
   cache, realtime channel, batch API, pagination, export, storage URL,
   notification payload, tenant-visible audit log ve delayed job replay kapsayan
   acceptance matrix'e ihtiyaç duyuyor.

3. Draft owner setup setup-only olmalı, normal tenant olmamalıdır. Default
   seçilememeli, switcher'da promote edilmemeli, export/notification/job eligible
   olmamalı ve normal tenant projection'larda görünmemelidir.

4. Role hierarchy exact write rule'lara ihtiyaç duyuyor. Önerilen baseline: yalnız
   owner admin assign/change/remove edebilir; admin manager/employee assign
   edebilir; manager role değiştiremez ve yalnız explicitly scoped employee-role
   operation yapabilir.

5. Custom role'lar owner-only power compose etmeden future-compatible kalmalıdır.
   Bir membership'in bir assigned role object'i olur; future custom role'lar
   hierarchy ve scope için bir built-in access class'a map edilir.

6. Archive/rehire membership access, location scope, invitation, onboarding case,
   todo, notification, kiosk/PIN/session access, future schedule, open time entry
   ve audit için atomic veya idempotent side effect tanımlamalıdır.

7. Account deletion eligibility pending ownership transfer, pending
   account-removal request, user'ın owner olduğu scheduled closure ve active
   deletion-grace restore state'i de dikkate almalıdır.

8. Invite-before-signup signup, email verification, OAuth redirect, wrong-account
   sign-out, expired/revoked token ve resumed login boyunca parked intent
   contract'a ihtiyaç duyuyor.

9. Invitation lifecycle pending, accepted, declined, revoked, expired, resent,
   reissued, wrong email, archive, reminders, todos ve outbox/audit linkage için
   transition table'a ihtiyaç duyuyor.

10. Employee onboarding reset/correction resume, edit before submit,
    rejected-step correction, employee start-over, admin reset, admin cancel,
    rehire restart, document/photo draft retention ve yeni invitation gerekir mi
    sorularında exact behavior gerektiriyor.

11. Global phone sharing explicit copy gerektiriyor: coworker sharing,
    owner/admin/manager visibility'yi kontrol etmez. Her employer
    onboarding/linking flow'unda user'a authorized manager'ların employer
    organizationlarda global phone'u görebileceği söylenmelidir.

12. Legal-name ve profile visibility archive/suspend/revoked kurallarına ihtiyaç
    duyuyor. Archived/suspended/revoked organizationlar global profile'daki
    read-only organization-name listesinde kalacak mı ve historical name'leri kim
    görebilecek karar verilmeli.

13. Profile photo state machine gerekir: none, pending_scan, pending_review,
    approved, rejected, revoked, replaced; visibility ve cache invalidation dahil.

14. Acknowledgement'lar first-class evidence olmalı: requirement version,
    policy/template content version, displayed text hash, accepted timestamp,
    actor/account/employee ID'leri, restricted IP/device log, re-ack trigger'ları,
    expiry behavior ve schedule-impact eligibility.

15. Requirement snapshot evidence-grade ID ve hash gerektiriyor. Current compliance
    policy değiştiğinde onboarding evidence silently mutate edilmemeli.

16. Optional document ve schedule conflict için matrix gerekir:
    required/optional x manual-review yes/no x expired/pending/rejected/approved x
    tracking/soft/hard; add, edit, drag, publish, republish ve existing published
    shift boyunca.

17. Review-document-from-Schedule UI preservation contract gerektiriyor: active
    drag cancel, draft ID ve unsaved editor state preserve, tek drawer layer, focus
    return, approve/reject sonrası conflict recalculate ve permission loss olsa da
    draft work korunmalı.

18. Todo source identity future UX değil backend correctness'tir.
    `source_type`, `source_id`, `source_version`, `subject_employee_id`,
    `organization_id`, `assignee_id`, lifecycle state, uniqueness/dedupe key,
    reopen/close semantics ve archive reassignment gerekir.

19. Notification mutability catalog gerekir: security/access unmutable, mandatory
    in-app operational, optional email operational, user-muted
    noncritical/marketing; email mute in-app state veya required Todo item'ı
    gizlememelidir.

20. Restaurant-scale owner UX explicit path'lere ihtiyaç duyuyor: skip team, add
    starter team veya continue in Employees after setup. Uncommitted partial team
    row'lar Finish'te discard edilebilir olmalıdır.

21. Helper checklist ayrılmalıdır. Phase 3 minimal post-Finish shell'e ihtiyaç
    duyar; Phase 7 persistence, hide/restore, role-specific progress ve advanced
    tracking'i ele alabilir.

22. Implementation öncesi empty state matrix gerekir: no employees, no invited
    employees, no schedule, no published schedule, no kiosk, no document rules, no
    employee actions, no employee shifts, trial active without card, trial
    expired/read-only ve no active/pending organizations.

### Taze Batch Brainstorming Gündemi

Bir sonraki plan konuşmasında şu sırayı kullan:

1. Owner modelini seç: exactly one owner-role membership mi, yoksa multiple owners
   plus one primary owner mı?
2. Manager organization-wide access effect yaratabilir mi, yoksa yalnız scoped
   work restriction/escalation mı yapabilir?
3. Canonical tenant binding ve projection allowlistlerini tanımla.
4. Owner onboarding için gereken minimal trial entitlement contract'ı tanımla veya
   invite dispatch'i trial'dan ayır.
5. Organization closure, retention purge, soft lock ve ownership transfer state
   machine'lerini tanımla.
6. Invitation ve employee onboarding lifecycle transition matrixlerini tanımla.
7. Review independence, document/acknowledgement evidence ve conflict matrixlerini
   tanımla.
8. Implementation phase'leri finalize edilmeden switcher placement ve minimal
   employee landing'i çöz.

### Taze Batch Değerlendirmesi

Plan yön olarak tutarlı, fakat henüz implementation-ready değil. Business
decision'ların çoğu yakalanmış; kalan risk, bazı kararların enforceable state
machine, transaction guard, projection allowlist ve acceptance test yerine product
behavior olarak yazılmış olması.

En yüksek riskli açık noktalar tenant context, owner singleton/transfer,
manager-scoped authority, hidden trial dependency, review independence,
invitation/onboarding transition'ları, Todo source identity ve schedule conflict
policy versioning. Bunlar implementation öncesi çözülmeli; aksi halde her phase
local UI check'leri geçerken cross-tenant veya lifecycle hole bırakabilir.

## İkinci 2026-09-05 Denetim Batch'i Ve Mimari Sentez

Bu batch altı focused readonly audit'i tekrar çalıştırdı ve sonuçlarını
orchestrator'ın current plan ve önceki synthesis üzerine yaptığı kendi review ile
birleştirdi.

### Tamamlanan Agentlar

- `01a0705c-9c17-7db1-a547-e18310ac7987` multi-tenant isolation, tenant context,
  projection, async work, audit log, storage URL ve generic 404'leri audit etti.
- `01a0705c-e8db-7f82-9eea-933bdb615647` owner lifecycle, ownership transfer,
  billing/trial closure, retention, soft lock ve account deletion'ı audit etti.
- `01a0705d-478c-70a2-8be8-7e821f6a17b0` role, manager scope, access boundary,
  drawer visibility, custom-role readiness ve schedule visibility'yi audit etti.
- `01a0705d-d56e-7e12-b43f-76a219e8242a` invitation, signup intent, employee
  identity, onboarding reset, archive/rehire, phone, photo ve legal name
  lifecycle'ı audit etti.
- `01a0705e-31c9-7941-8073-ff8a8d95d847` document, acknowledgement, Todo,
  notification, schedule conflict ve review flow'ları audit etti.
- `01a0705e-94d1-7650-9282-c2c06ed57c26` product UX, owner wizard, app tour,
  checklist, no-org acquisition, switcher, employee landing ve phase sequencing'i
  audit etti.

### Orchestrator Değerlendirmesi

İkinci batch birinci batch ile maddi bir çelişki üretmedi. Aynı core diagnosis'ı
güçlendirdi: product decision'lar çoğunlukla tutarlı, fakat plan hâlâ fazla prose
behavior olarak yazılmış. Implementation öncesinde plan enforceable modellere
ihtiyaç duyuyor:

- authoritative state-transition matrix'ler,
- server-side transaction guard'lar,
- role/access matrix'leri,
- tenant projection allowlistleri,
- async execution-time revalidation,
- evidence/versioning contract'ları,
- negative case'leri kanıtlayan acceptance testler.

En büyük implementation riski eksik bir ekran değil. Risk, ownership transfer,
manager scope, invitation state, pending onboarding, billing soft lock, Todo
automation ve Schedule conflict gibi bağımsız kararların şu anda ayrı sectionlarda
anlatılması. Later phase'in earlier invariant'ı bypass etmemesi için bunların tek
shared state model'e ihtiyacı var.

### Birleşik P0 Bulgular

1. Tenant context hard contract olmalıdır.
   Route/tab organization, `x-organization-id`, request body organization,
   resource ownership, cache key, default organization preference, realtime
   channel, export, notification payload, storage URL ve audit event deterministic
   mismatch behavior'a sahip olmalıdır. Default organization preference user'ı
   login sonrası route edebilir; request authorize veya repair edemez.

2. Non-active her state için projection allowlist gerekir.
   Active switcher item, pending onboarding card, suspended card, invitation
   preview, no-org acquisition ve draft owner setup ayrı allowed field list'e
   sahip olmalı. Pending/suspended/invitation state'leri employee name, schedule
   signal, document detail, Todo count, notification count, audit detail, internal
   reason veya inviter identity sızdırmamalı.

3. Owner modeli unresolved ve implementation'ı blokluyor.
   Plan şu anda exactly one primary owner diyor; user'ın sonraki wording'i ise
   organization ownerless olamaz ve en az bir owner olmalı diyor. Bunlar aynı
   model değil. Implementation öncesi seçmeliyiz: V1 exactly one owner-role
   membership mı olacak, yoksa multiple owners with exactly one primary owner mı?
   Daha güvenli V1 implementation exactly one active owner-role membership, fakat
   explicit product approval gerekiyor.

4. Active owner employee record lifecycle-protected olmalıdır.
   Normal archive, terminate, suspend, revoke, unlink, delete, self-leave ve
   account-removal flow'ları active owner'ı kaldıramamalıdır. İzinli çıkışlar
   accepted ownership transfer, organization closure veya restricted platform
   intervention olmalıdır.

5. Ownership transfer lock family gerektiriyor.
   Transfer pending iken competing transfer, owner role write, owner employee
   lifecycle write, organization closure, account deletion/removal ve
   billing-owner/payment-instrument mutation path'leri lock edilmelidir. Transfer
   acceptance idempotent, strongly authenticated ve session/cache invalidating
   olmalıdır.

6. Billing/trial hâlâ hidden Phase 3 dependency.
   Owner Finish 14-day trial'ı başlatıyor ve invite dispatch buna bağlı, fakat
   billing/trial implementation out of scope. Plan Phase 3 için minimal internal
   `trial_entitlement` record tanımlamalı veya invitation'ları billing phase'e
   kadar trial activation'dan ayırmalıdır.

7. Organization closure ve system retention purge ayrı lifecycle olmalıdır.
   Owner-requested immediate closure, owner-scheduled end-of-period closure ve
   trial/payment failure sonrası system retention purge farklı actor ve
   authority'lerdir. Ayrı state, notice, cancellation window, export window,
   tombstone rule ve purge semantic gerektirir.

8. Soft lock role/mutation allowlist'e ihtiyaç duyar.
   "Writes disabled" fazla belirsiz. Owner/admin/manager/employee/system
   webhook/export/retention/purge capability'leri açıkça allow veya deny
   edilmelidir. Schedule publish, invite, roster, onboarding, kiosk/time-entry,
   document-rule ve settings mutation'ları exact behavior gerektirir.

9. Manager authority hâlâ fazla geniş veya çelişkili.
   Scoped manager'ın onboarding approve etmesi, invite revoke etmesi, access
   suspend etmesi veya document review etmesi multi-location employee için
   organization-wide effect yaratabilir. Manager power'ları full access
   operation mı, scoped work restriction mı, yoksa escalation request mi karar
   verilmeli. Benim önerim: manager invitation revoke, membership revoke,
   organization access suspend veya role change yapamaz; yalnız explicitly scoped
   employee-role operation yapar.

10. Review independence explicit olmalıdır.
    Submitter kendi onboarding case, legal-name correction, document,
    acknowledgement veya photo'sunu approve, reject veya final-approve edemez.
    Peer ve higher-role review restriction için access-class rule gerekir.

11. Tek authoritative lifecycle transition matrix eksik.
    Invitation, delivery, onboarding case, membership, employee lifecycle,
    document review, photo review, legal-name correction, phone confirmation,
    suspension, revoke, archive, rehire, owner transfer, closure, soft lock ve
    account deletion action, actor, from-state, to-state, guard, side effect,
    preserved/deleted data, auth/cache invalidation, notification/audit,
    retry/idempotency ve test içeren ortak tabloya ihtiyaç duyuyor.

12. Compliance evidence implementation-ready değil.
    Acknowledgement, requirement snapshot, document upload, review ve expiration
    policy için version ID, hash, actor ID, timestamp, reviewer identity,
    re-ack trigger, expiry behavior ve immutable evidence record gerekir.

13. Schedule conflict policy versioning ve draft preservation gerektiriyor.
    Compliance policy change açık Schedule add/edit/drag/publish flow'unu
    beklenmedik biçimde değiştirmemeli. Draft ve publish attempt'leri pinned
    policy version, stale-policy recalculation ve explicit preservation rule
    gerektirir.

14. Todo source identity future UX değil backend correctness'tir.
    Automatic document expiry/rejection/request todos için source identity ve
    dedupe semantic şimdi gerekir. Detailed Todo comment/recurrence/filter UI
    sonraya kalabilir.

15. Mandatory app tour kararı mevcut plan text'iyle çelişiyor.
    Mevcut plan checklist'in guided product tour olduğunu ve ayrı mandatory tour
    olmadığını söylüyor. User'ın sonraki kararı en az bir app tour visit'in
    mandatory olduğunu söylüyor. Spec real page'lere route eden mandatory
    visit-based checklist task'lara çevrilmelidir.

16. Switcher placement ve employee landing hâlâ gating decision.
    Product seviyesinde TBD kalabilirler, fakat minimum route/home contract
    olmadan Phase 2/Phase 4 implementation bloklanmalıdır. Employee landing geçici
    olabilir, ama activated employee blank veya ambiguous parent route'a
    düşmemelidir.

### Birleşik P1 Bulgular

1. Generic not-found behavior single read/write, pagination total, batch API,
   redirect, pratik olduğu ölçüde timing, export filename, notification payload ve
   storage URL kapsamına alınmalıdır.

2. Storage URL revocation org switch, role/scope reduction, suspend, revoke,
   archive, organization closure ve purge start için explicit olmalıdır.

3. Same email across multiple orgs için acceptance testler no role bleed,
   employee identity bleed, legal name bleed, phone sharing bleed, notification
   bleed, document bleed, schedule bleed, Todo bleed, export bleed, audit bleed ve
   cache bleed olmadığını kanıtlamalıdır.

4. Invite action'lar ayrı verb'lere ihtiyaç duyuyor:
   `reminder` aynı token ve lifetime extension yok demektir;
   `resend_delivery` aynı token ve delivery retry/rate-limit demektir;
   `reissue` yeni token/lifetime ve old token invalidated with audit reason
   demektir.

5. Invite-before-signup email verification, OAuth redirect, wrong-account
   sign-out, expired/revoked link ve resumed login boyunca parked intent contract
   gerektiriyor.

6. Employee onboarding reset/start-over employee reset, admin reset, admin cancel,
   rejected-step correction, rehire restart ve document/photo draft retention için
   full rule gerektiriyor.

7. Delivery failure invite'ı asla revoke etmemeli, employee'yi silmemeli veya
   owner setup'ı rollback etmemelidir. Bounce/complaint yalnız delivery state'i
   günceller.

8. Global phone kararları çoğunlukla sağlıklı fakat copy/test gerekiyor:
   website signup'da phone required değil, global phone optional, onboarding
   present ise global phone'u kullanır, yalnız user edit eder, owner/admin/scoped
   manager read-only görür ve coworker sharing ayrıdır.

9. Archived/suspended/revoked organization sonrası legal-name profile visibility
   açık. Öneri: account holder historical org-scoped legal name'leri read-only
   görür; live org access to global email/phone archive/revoke ile biter.

10. Profile photo şu state'lere ihtiyaç duyuyor: none, pending_scan,
    pending_review, approved, rejected, revoked, replaced; visibility, fallback ve
    cache invalidation dahil.

11. Role hierarchy prose, actor-role x target-access-class matrix'e çevrilmeli.
    Current "one role below" wording manager/admin edge case'leri ve custom role
    için fazla belirsiz.

12. Same-org other-location shift visibility tutarsız.
    Manager kendi scope'undaki employee'nin current location dışındaki shiftleri
    için full detail mi görecek, yoksa minimum ghost-shift conflict badge mi
    görecek karar verilmeli.

13. Manager document scope single-location, multi-location, remote/excluded
    zero-location, location change, org-wide requirement, sensitive category ve
    manager/admin/owner subject için matrix gerektiriyor.

14. Optional document explicit schedule-impact semantic gerektiriyor. Optional
    activation block yok demektir, fakat optional document soft veya hard schedule
    conflict yaratabilir mi hâlâ belirsiz.

15. Manual Todo ve system Todo ayrılmalıdır. Manual todo genel olabilir; system
    compliance todo silently completed veya duplicated olamaz.

16. Restaurant-scale team entry şu modları gerektiriyor: skip for now, add starter
    team veya continue in Employees. Uncommitted partial row'lar Finish'te discard
    edilebilir olmalıdır.

17. Week start ve 12h/24h time format checklist-only'dir, owner Finish blocker
    değildir; fakat scheduling-preferences checklist item ikisi de seçilmeden
    complete olamaz.

18. Employees, Kiosk ve Documents checklist item'ları gerçek page'lere navigate
    etmeli ve "visited" olarak işaretlenmeli; full setup tamamlanmış gibi
    davranmamalı.

19. Implementation öncesi empty state matrix gerekir: no employees, no invites,
    no schedule, no published schedule, no kiosk, no document rules, no employee
    required actions, no employee shifts, no active/pending orgs, trial active
    without card, trial expired/read-only.

### Birleşik Önerim

Roadmap'e daha fazla prose ekleyerek devam etmeyelim. Bir sonraki artifact,
planı enforceable section'lara yükselten kompakt bir "Implementation Contract
Addendum" olmalıdır:

1. Tenant Context Contract ve Projection Allowlists.
2. Owner, Transfer, Closure, Soft-Lock ve Retention State Machine.
3. Manager scope ve custom-role future shape dahil Role/Access Matrix.
4. Invitation ve Employee Onboarding Lifecycle Matrix.
5. Compliance Evidence, Todo Source Identity ve Schedule Conflict Matrix.
6. UX Gate Decisions: app tour/checklist, switcher placement, employee landing,
   restaurant-scale team entry ve empty states.

Bu addendum review edildikten sonra ana plan tek seferde amend edilebilir.
Parça parça edit etmek çelişkileri saklama riski yaratır.

### Sıradaki Tartışma Kararları

1. Owner modeli: V1'de exactly one owner-role membership mi, yoksa multiple owners
   with one primary owner mı?
2. Manager authority: manager organization-wide access effect yaratabilir mi,
   yoksa yalnız scoped work restriction/escalation mı yapabilir?
3. Trial dependency: Phase 3'te minimal internal `trial_entitlement` mı, yoksa
   invite dispatch trial'dan bağımsız mı?
4. Closure modeli: scheduled close, immediate close, soft lock, retention pending
   purge, purge started ve purged için exact state'ler neler?
5. Schedule visibility: other-location shift'ler için yalnız ghost badge mi,
   yoksa employee manager scope'taysa full shift detail mi?
6. Optional document schedule impact: optional doc hard conflict yaratabilir mi,
   yoksa yalnız tracking/soft warning mi?
7. Employee landing: geçici `/app/employee-hub` kararı şimdi mi, yoksa product
   design çözülene kadar Phase 4 blok mu?

### Değerlendirme Sonucu

Plan henüz implementation-ready değil. Addendum pass için hazır. Addendum, kod
başlamadan önce required Phase 0 output olarak ele alınmalıdır. Aksi halde muhtemel
failure mode eksik ekran değil; data leakage, stale access, ownerless organization
state'leri, duplicated/completable compliance todo'lar ve edit ortasında davranışı
değişen Schedule conflict'ler olacaktır.
