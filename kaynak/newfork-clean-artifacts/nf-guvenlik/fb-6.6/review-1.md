KARAR: ONAY @85267a22

# FB-6.6 A1 + A2 — güvenlik ve kod incelemesi (nf-guvenlik, tur 1)

İncelenen: `task/fb-6.6-a2` @ `85267a22` (origin/main üstünde 10 commit; iki migration
`20261006000000_documents_and_onboarding_ask_the_core.sql`, `20261006010000_pending_documents_legal_names_one_document_permission.sql`;
API, shared ikizi, web kapıları). Başkasının worktree'sine dokunulmadı (yalnız `git show` / `git diff`).

## Özet (kod okumayan için)
- Kritik 0, Yüksek 0, Orta 0, Düşük 4, öneri 3.
- Belge, imza şablonu ve çalışan onboarding'inin bütün giriş kapıları artık tek yerden (veritabanındaki yetki çekirdeği) karar alıyor.
  Örnek: Kadıköy müdürü Ayşe, eş müdür Deniz'in Food Handler belgesini onaylamaya çalışınca "hayır" (`authz.rank`) alıyor;
  Deniz'in bekleyen belgesini Employees → Deniz → Documents'ta görmüyor; admin Zeynep onaylayınca görüyor.
- Başka workspace'e ya da yetkisiz lokasyona giden yol bulmadım. Bilgi eksikken izin veren (fail-open) yol bulmadım:
  belge bulunamazsa çekirdek "kapsam dışı" diyor; bilinmeyen hedef ile kapsam dışı hedef aynı cevabı alıyor.
- Resmî ad (S1): müdür, rolünde `employees.private.manage` olsa bile onaylayamıyor; yalnız admin ya da owner, bir üst kademe, kendininkini değil.
- İmza izinlerinin belge izinlerine katlanması: önce yeni izin veriliyor, sonra eskisi siliniyor; yerel DB'deki 1452 eşleme satırının hiçbiri erişim kazanmıyor ya da kaybetmiyor.

## Bulgular

### Düşük
1. **Owner yüklemesinde API ile DB farklı işarete bakıyor** — `apps/api/src/employees/document-lifecycle-service.ts:317-322`.
   API "owner'ın muaf satırı" kararını `exemption_locked` (kişi bugün owner mı) ile, DB ise `owner_excused` (satırdaki işaret) ile veriyor
   (`20261006000000…:1764`, `:1802`). Örnek: admin, owner'ın bir belgesini elle muaf tuttuysa API yüklemeye izin hazırlar, DB "closed" ile reddeder.
   Sızıntı yok (DB son sözü söylüyor, kapalı kalıyor); kişi yalnız dosyayı yükledikten sonra hata görür.
   Öneri: `document_obligation_json` bir `owner_excused` alanı döndürsün ve API ona baksın; ya da API kontrolü DB'ye bıraksın. Düzelten: `nf-backend` (alan için `nf-db`). Backlog'a yazılabilir.
2. **Settings → Documents API rotalarında ikiz kapı kaldı** — `apps/api/src/settings/document-types-routes.ts:36-43, 75, 102, 133, 165, 194`.
   Acknowledgements uçlarındaki yerel `signature_templates.manage` kapısı silindi, ama aynı DB eylemini (`settings.documents.write`) soran
   belge türü uçları hâlâ kendi `documents.manage` kapısını tutuyor. Görev dosyasının Touches listesinde bu dosya var. Kapı kapalı yönde
   (fazladan engel), sızıntı yok; ama CLAUDE.md §9 "ikiz sistem yok" kuralına ters ve iki ucun "hayır" cevabı farklı (biri sabit metinli 403, öteki çekirdeğin nedeni).
   Öneri: `resolveActor` + DB kararı, signature-settings-routes'taki gibi. Düzelten: `nf-backend`. Bu işte ya da backlog'da.
3. **S2'nin onboarding inceleme yolu testsiz** — `20261006010000…:221-240` (`get_employee_onboarding_review_service`).
   Bekleyen belge satırını karar veremeyen okuyucudan saklayan süzgeç doğru yazılmış, ama onu bozunca düşen bir pgTAP hücresi yok
   (`documents_on_the_core.test.sql` S2'yi liste ve tekil okumada sınıyor; indirme tekil okuma üzerinden dolaylı korunuyor).
   Senaryo: özel rolünde `employee_documents.read` ve `employee_onboarding.review` olan ama `employee_documents.review` olmayan bir müdür
   Emre'nin onboarding'ini açar; bekleyen belge satırını görmemeli. Aynı cevaptaki `progress_total` gizlenen satırı da sayıyor
   ("3 / 4" gibi) — içerik sızmıyor, yalnız sayı. Öneri: bir hücre (olumlu: karar veren görür; olumsuz: okuyup karar veremeyen görmez). Düzelten: `nf-db`.
4. **Kendi onboarding okumasında yetki workspace'i ile okunan vaka ayrışabiliyor** — `20261006000000…:1995-1999`.
   `get_employee_onboarding_service` yetkiyi `onboarding_self_workspace(…, false)` (ilk üyelik) üzerinden soruyor, vakayı ise
   `employee_onboarding_case_id(u, null)` (açık vakalar önce) ile okuyor. Workspace verilmezse ikisi farklı workspace'e düşebilir;
   kişi kapanmış bir workspace'teki kendi onboarding özetini okuyabilir. Yalnız kendi verisi; API workspace verdiğinde (`onboarding-service.ts:188`) olmuyor.
   Kaydetme, gönderme ve ayrılma doğru (`by_case = true`). Öneri: okumada da `by_case = true`. Düzelten: `nf-db`. Backlog yeter.

### Öneri (zevk / küçük)
- `apps/api/src/employees/onboarding-routes.ts:125-126` yorumu "employee.read" diyor; servis `onboarding.review` soruyor. Yorum düzeltilsin.
- S2'nin yan etkisi (ürün notu, hata değil): onaylı belgenin yenisi incelemeye düşünce satırın tamamı (eski geçerli onay dahil) karar veremeyen
  müdürden saklanıyor. Örnek: Deniz'in geçerli Food Handler'ı varken yenisini yükledi; Ayşe ikisini de görmez. İstenen buysa sorun yok; değilse Mert'e soru.
- Sahiplik devrinde eski owner'ın `owner_excused` işareti, belge yayından kalkmışsa `PT409` yutularak kalıyor
  (`respond_workspace_ownership_transfer_service`, bu dalda değişmeyen kod). Bu dal `owner_excused`'ı "incelemesiz kabul" anlamına getirdiği için baktım:
  yeniden yayında `set_document_publication_service` işareti sıfırlıyor (`20261006000000…:1303-1306`) ve yayından kalkmışken yükleme zaten kapalı.
  Bugün delik yok; bu işarete dokunan her yeni yol aynı sıfırlamayı yapmalı.

## Özellikle bakılanlar (görev mesajındaki 9 madde)
1. Tenant / yetki: kapsamdaki her `public.*_service`'in ilk ifadesi `app_private.authorize(`; kalan istisnalar arka plan işi
   (`documents_maintain_service`, `sync_expiring_document_todos_service`), Schedule çakışma yüklemleri ve FB-6.8'in `update_owner_onboarding_service`'i.
   Bütün `security definer` fonksiyonlarda `search_path` var; `anon` / `authenticated` için bu alandaki hiçbir fonksiyonda `execute` yok;
   yeni `app_private` fonksiyonlarında `revoke all … from public, anon, authenticated` var. Silinen 14 fonksiyon ve `signature_templates.%` izni `retired_objects_stay_gone`'da;
   silinenlere kalan çağrı yok (DB ve uygulama kodu).
2. S2 sızıntısı: liste, tekil okuma, indirme (tekil üzerinden) ve onboarding incelemesi süzülüyor; "inceleme bekliyor" bildirimi yalnız karar verene gidiyor
   (`enqueue_document_notification` + teslimde `document_notification_policy`); süre uyarısı yalnız onaylı belge için; Schedule'daki "belge eksik" bilgisi değişmedi (Mert'in S2 metniyle uyumlu);
   hesap sayacı yalnız kişinin kendi belgesini sayıyor. Belge tablolarında `authenticated` politikası yok, belge deposunda istemci politikası yok; doğrudan okuma yolu yok.
3. S1: `onboarding.legal_name` = `org` + `write` + `no_self` + `rank_below`; M2'de müdürün `org write` erişimi `none` olduğu için müdür reddediliyor;
   admin başka admin'inkini ve kendininkini onaylayamıyor (rank).
4. D6: davet kabulü `app_private.initialize_employee_onboarding`'i kapısız çağırıyor (kapı kabulün kendisinde); taslak tanım tetikleyiciyle önce süzülüyor; pgTAP hücresi var.
5. İzin katlama: önce `insert … on conflict do nothing`, sonra `delete`; bağımlılık satırları ve `authz_actions` güncelleniyor; yeni workspace rolleri izinleri
   `public.permissions`'tan türetiyor, silinen anahtar tohumlanmıyor. Canlı için güvenli: yalnız 12 eşleme satırı gider, aynı roller `documents.*`'ı zaten taşıyor.
6. API: `onboarding-routes.ts` ve `signature-settings-routes.ts`'teki her uç DB servisine `actor_user_id` ile gidiyor (service role çekirdeği atlamıyor);
   hata `rpcFailure` ile 404 / 403'e dönüyor. BL-118, bulgu 1'deki farkla birlikte doğru.
7. Web: `can()` / `ActionRoute` geçişleri doğru; Support ve Settings dış kapısı `canEnterSettings` ile korunuyor (`SettingsLayout.tsx:115`);
   resmî ad düğmeleri `onboarding.legal_name`'e bağlı. Web'de `permissions.includes` 29 → 21.
8. Katalog: `auth.uid()` 22 → 11, `request.jwt` 24 → 13, kendi kapsam mantığı 32 → 26, ipuçsuz 42501 161 → 111 (tavanlar yalnız indi);
   yeni `_base` / `_vN` / `_legacy` yok (diff'teki iki `_base` main'de zaten vardı, yalnız `create or replace`).
9. Testler: D1 (Ayşe → Deniz rank; Zeynep → kendi ve Kaan rank; owner → admin olur), D2 (Mehmet onaylar, Ali iki lokasyonda açılır),
   D3 (Hande onaylayamaz, okuyamaz, kendininkini açar), D4 (Aydan bildirimlerini açar; başka workspace not_member), D5 (owner yükler, hemen kabul, kuyrukta değil),
   D6, S1 (olumlu + olumsuz), S2 (olumlu + olumsuz), çekmece bayrağı = komut. Gevşetilmiş beklenti görmedim; silinen hücreler bugün olmayan kurala aitti.

## Kanıt (çalıştırdığım komutlar)
- `git diff origin/main...85267a22` (59 dosya) ve iki migration'ın tamamı okundu.
- Yerel DB (main ile aynı: son migration `20261005010000`); `db.lock` alındı ve bırakıldı; CI boştaydı (`gh run list --limit 3`).
  İki migration tek psql oturumunda `begin; … rollback;` içinde uygulandı, hatasız. Ölçümler:
  - bu alandaki fonksiyonlarda `anon` / `authenticated` `execute`: 0;
  - `search_path`'siz `security definer`: 0 (public + app_private);
  - çıplak `signature_templates.read|manage` anahtarına başvuran fonksiyon: 0; kalan izin satırı: 0;
  - `app_private.set_document_exemption` `prosecdef = f` (BL-264);
  - silinen fonksiyonlara kalan çağrı: 0;
  - uygulama öncesi: `signature_templates.*` taşıyan 1452 eşleme, belge karşılığı olmayan 0 (erişim kazancı ya da kaybı yok);
  - `onboarding.legal_name`: `org | write | employee_onboarding.review | no_self t | rank_below t | restricted_ok f`.
- Otomatik kapıları (pgTAP, vitest, matris) yeniden koşmadım; görev mesajındaki sonuçlara dayandım.
