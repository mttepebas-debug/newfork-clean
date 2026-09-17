# AUTH-002 Davet guard'ı ve workspace bazlı onboarding getter'ı (DB + API)
Status: active (2026-09-17; DB kilidi bu task'ta)
Session: "AUTH-002: davet guard'ı ve onboarding getter" (local_0bcb5eb5; eski AUTH-001 session'ı, bağlam sıcak)   Branch: task/auth-002   Worktree: newfork-wt/auth-002   DB: lock (2 yeni migration)
Öneri: Opus 5, high. Yetki guard'ı ve RPC imza değişikliği; PostgREST overload tuzağı var.
Kaynak plan (bağlayıcı): `C:/Users/TheWe/.claude/plans/kay-t-olduktan-sonra-login-idempotent-eich.md` → T2 madde 1 ve 5, "Edge case'ler". Web tarafı AUTH-UX-001'de; bu task yalnız `supabase/` ve `apps/api/`.

Goal: Bekleyen daveti olan ve owner üyeliği olmayan hesap workspace yaratamasın (DB'de). Employee onboarding getter'ı workspace parametresi alsın; parametresiz çağrıda tamamlanmamış case'i tercih etsin.

Kullanıcı kararları (2026-09-16; ayrıntı planda):
- Create workspace kuralı (UI ve DB aynı): active owner üyeliği varsa yaratabilir; üyeliği yoksa ve bekleyen davet de yoksa yaratabilir; bekleyen davet var + owner üyeliği yok → yaratamaz; owner olmayan üyelik → yaratamaz (mevcut guard).
- KİLİTLİ KARAR DEĞİŞİKLİĞİ: docs/rebuild `onboarding-master-implementation-plan-2026-09-05.md:283-293` "Start my own daveti bekler bırakır" → sert engel. Gerekçe: davetli kişi employee'dir; yanlışlıkla işveren hesabı ve hatalı kurulum döngüsü önlenir.
- Onboarding workspace'e aittir; çoklu üyelikte doğru workspace'in case'i açılır.
- Süresi dolmuş davet pending sayılmaz (`expires_at > now()`); guard ve liste aynı filtreyi kullanır.

In scope:
1. **Migration A — guard:** `public.create_owner_workspace_service` (`20260914214056_account_workspace_owner_controls.sql:2-26`) başına, mevcut owner guard'ından önce: actor'ün hiç active owner üyeliği yoksa ve `lower(auth.users.email)` için `employee_invitations.status='pending' and expires_at > now()` ve o workspace'te üyeliği olmayan davet varsa `raise exception 'pending invitation must be resolved first' using errcode = '42501'`. E-posta eşleme `list_pending_employee_invitations_for_account_service` (`20260908138000:28-55`) ile birebir aynı (`exists` alt sorgusu; yeni fonksiyon yok). Mevcut "workspace owner access required" guard'ı ve `for update` kilidi aynen kalır. Grant/revoke satırları korunur.
   - pgTAP `supabase/tests/account_workspace_controls.test.sql`: (i) sıfır üyelik + bekleyen davet → 42501; (ii) davet var ama zaten active owner → geçer; (iii) süresi dolmuş davet → geçer.
2. **Migration B — getter:** `get_employee_onboarding_service(target_user_id uuid, target_workspace_id uuid default null)`.
   - PostgREST overload tuzağı: önce `drop function public.get_employee_onboarding_service(uuid)`; sonra 2 parametreli sürüm; `revoke all ... from public, anon, authenticated` ve `grant execute ... to service_role` yeniden yazılır (`20260818170000:997,1010` kalıbı). Tek parametreyle çağrı default ile çalışır; iki overload bir arada bırakılmaz (PGRST203).
   - Başlatma: `initialize_employee_onboarding_service(target_user_id, target_workspace_id)` iki parametreli sürüm zaten var (`20260908183000:272`); getter onu çağırır.
   - Seçim: parametre verildiyse o workspace'in case'i (`employee_onboarding_cases.workspace_id`); yoksa `raise exception 'employee onboarding is unavailable' using errcode = 'P0002'`. Parametre null ise `order by (onboarding.status = 'approved'), onboarding.created_at limit 1` (tamamlanmamış case önce). `needs_selection` gibi yeni JSON şekli yok; seçim web'de yapılır (AUTH-UX-001 S7).
   - Gövdenin geri kalanı `20260908192000_employee_onboarding_getter_allows_initialization.sql` ile aynı kalır (kopyala, yalnız seçim ve başlatma satırları değişir).
   - pgTAP: iki workspace'te case'i olan kullanıcı için (i) parametreli çağrı doğru workspace; (ii) parametresiz çağrı approved olmayanı döner; (iii) yanlış workspace → P0002.
3. **Migration B devamı — mutasyonlar (2026-09-17 koordinatör bulgusu; AUTH-UX-001 faz 1 notundan doğrulandı):** `save_employee_onboarding_profile_service` (`20260914211402_...`), `submit_employee_onboarding_service` (`20260908153000_...`), `reset_employee_onboarding_service` ve `leave_employee_onboarding_service` case'i yalnız `user_id = target_user_id` ile seçiyor (save'de sıralama bile yok). Çoklu üyelikte yanlış workspace'in case'ine yazar. Çözüm:
   - Tek iç yardımcı: `app_private.employee_onboarding_case_id(target_user_id uuid, target_workspace_id uuid)`; seçim kuralı getter ile aynı (workspace verildiyse o; değilse approved olmayan, en eski). Getter ve 4 mutasyon bu yardımcıyı kullanır; mutasyonlar `select ... where id = <yardımcı> for update` ile kilitler.
   - 4 mutasyona `target_workspace_id uuid default null` eklenir; her biri için eski imza drop edilir, grant/revoke yeniden yazılır (aynı PGRST203 tuzağı). Gövdelerin geri kalanı en güncel tanımdan birebir kopyalanır.
   - `confirm_employee_document_service` ve `acknowledge_employee_requirement_service` requirement id ile çalışır; requirement → case → employee.user_id doğrulamasını kontrol et, doğruysa dokunma, raporla.
   - pgTAP: iki case'li kullanıcıda workspace parametreli save/submit doğru case'i değiştirir; diğer case'in revision'ı değişmez.
4. **API:** `GET /v1/me/onboarding?workspaceId=<uuid>` (`onboarding-routes.ts:51`, zod uuid optional) → `service.get(token, workspaceId)` → RPC'ye `target_workspace_id` (yalnız verildiyse). Aynı opsiyonel `workspaceId` query parametresi `PATCH /v1/me/onboarding/profile`, documents prepare/confirm (servis içindeki `get` çağrısı dahil), submit, reset ve leave route'larına eklenir ve ilgili RPC'ye geçirilir. Parametre yoksa davranış bugünkü gibi kalır. `workspace-account-routes.ts:524` `requestError`: "must be resolved" içeren mesaj → 403.
   - Testler: `onboarding-routes`/`onboarding-service` testine parametre geçişi; `workspace-account-routes.test.ts` guard hatası 403.

Out of scope: web (AUTH-UX-001), `/v1/invitations/*` 409/401 düzeni (BACKLOG), davet token'ı kalıcılığı (düşürüldü), "terminated" filtresi (böyle bir status yok), hosted push (OPS-010 akışıyla, koordinatör).

Done when:
- Getter ve 4 mutasyon workspace parametresi alıyor; seçim tek yardımcı üzerinden.
- İki migration local'e uygulanmış (DB lock), pgTAP ilgili dosyalar PASS (fixture drift için memory `local-db-test-fixture-drift`).
- API testleri ve api typecheck PASS.
- Branch push edilmiş, rapor koordinatöre gönderilmiş (migration adları ve pgTAP sonuçları tek satır).

Touches: supabase/migrations/2 yeni dosya, supabase/tests/{account_workspace_controls,employee_onboarding_*}.test.sql, apps/api/src/employees/onboarding-{routes,service}.ts (+test), apps/api/src/account/workspace-account-routes.ts (+test).
Test plan: migration sonrası pgTAP (yalnız ilgili dosyalar), sonra API focused testler + typecheck.
Risk:
- UI-DOC-001 da DB kilidi isteyecek; aynı anda çalışmaz.
- `.gitattributes` gereği migration'lar LF; CRLF ile kaydetme.
- pgTAP fixture drift.

## Notes / Result
