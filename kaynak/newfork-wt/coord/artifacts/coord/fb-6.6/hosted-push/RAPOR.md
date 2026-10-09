# CANLI: TAMAM

FB-6.6'nın dört migration'ı canlı veritabanında (hosted Supabase, proje `hvyvyisrqyathtliyyyv`, Vercel'deki API'nin kullandığı tek veritabanı) uygulandı. Yol: yalnız MCP `apply_migration`; CLI `db push` kullanılmadı. Rol: nf-db (alt ajan), koordinatör adına. Git'e ve yerel ortak DB'ye dokunulmadı.

## 1. Nerede duruyor
Bitti. Dört sürüm canlıda, her birinin içeriği repodaki dosyayla bayt bayt aynı (md5 kanıtı aşağıda). Silinen veri yalnız Mert'in onayladığı satırlar ve sayısı beklenenle aynı (12).

## 2. Ne yapıldı (etkisi)
- **Settings > Documents ve Signature templates** ekranlarının arkasındaki kayıt/yayın/arşiv işlemleri artık yetki çekirdeğine soruyor (owner/admin; `settings.documents.write`). Eski 12 "köprü" fonksiyon ve 3 eski yardımcı silindi (ör. `public.save_document_type`, `public.service_actor_can_access_employee`).
- **Belge ve onboarding uçları** (Employees > çekmece > Documents, Account > Documents, /welcome onboarding adımları) çekirdeğe soruyor.
- **S1 (Mert'in kararı):** onboarding'de yazılan legal name'i yalnız owner veya admin onaylar. Örnek: Ali onboarding'de adını "Alí" diye düzeltirse Kadıköy müdürü onaylayamaz; admin Ayşe onaylar. Çekirdeğe `onboarding.legal_name` eylemi eklendi.
- **S2 (Mert'in kararı):** incelemeyi bekleyen, reddedilen ya da incelenmeden yerine yenisi konan bir belge yalnız karar verebilecek kişiye ve sahibine görünür; onaylanan belge M2 kapsamında görünür. Sayaç da gizli satırı saymaz.
- **Tek belge izni:** `signature_templates.read/.manage` izinleri `documents.read/.manage` içine katlandı. Settings > Roles ekranında artık tek "View/Manage documents and acknowledgements" çifti var.
- `app_private.set_document_exemption` artık çağıranın yetkisiyle çalışıyor (BL-264).

## 3. Açık kalan ve nedeni
- Yerel karşılaştırma (aynı fonksiyonların yerelde rollback içinde md5'i) yapılmadı: görev "yerel ortak DB'ye dokunma" diyor. Yerine her migration'ın tam metni canlıdaki `statements[1]` md5'iyle repo dosyasına eşlendi.
- Başka açık yok.

## 4. Ekranda ne değişti
Canlı uygulamada (Vercel, `newfork-clean-api.vercel.app`) şu an main'deki API zaten yeni fonksiyonları çağırıyordu; bu gönderimle canlı veritabanı ona yetişti.
- Settings > Roles: rol izin listesinde "Signature templates" satırları kalktı; belgeler tek çift izinle.
- Employees > çekmece > Documents: müdür, karar veremediği bekleyen/reddedilen yüklemeyi görmez.
- Onboarding review: legal name onayı müdürde görünmez/yapılamaz.

## 5. Sırada ne var
- Koordinatör: KOORDINATOR-KARARLARI'na canlı gönderim satırı; FB-6.6 kaydı.
- Yolda bulunan: canlıda sürüm damgası sunucu tarihiyle (2026-10-03...) atanıyor, repo sürümleri 2026-10-06'lı; `version > X` filtresi bu yüzden boş döndü (bir kez). Düzeltme sorgusu `name` + damga ile yapıldı. Hafızaya not düşüldü.

## Kanıt

### Önkoşul
`list_migrations`: son sürüm `20261005010000 closed_location_loses_warn`; dört FB-6.6 sürümü yoktu.

### Silinen satırlar (önce / sonra)
| Tablo | Önce | Sonra | Not |
|---|---|---|---|
| `public.workspace_role_permissions` (`signature_templates.%`) | 12 | 0 | 3 workspace × owner/admin × 2 anahtar; özel rol 0 |
| `app_private.role_permission_dependencies` (`signature_templates.%`) | 1 | 0 | |
| `public.permissions` (`signature_templates.%`) | 2 | 0 | FK'ler RESTRICT/NO ACTION, zincirleme silme yok |
| `app_private.authz_actions` `settings.signature_templates.read` | permission_key `signature_templates.read` | `documents.read` | update, silme değil |
Önce ölçülen `would_insert` = 0: owner/admin rollerinde `documents.read/.manage` zaten vardı; sonra 6 rol × 2 = 12 satır duruyor.
Başka tabloda üst düzey silme yok (dört dosyanın üst düzey ifadeleri tarandı; 3. ve 4. dosyada yalnız fonksiyon/revoke).

### Yedek
Klasör: `C:/Users/TheWe/Documents/Codex/newfork-wt/coord/artifacts/coord/fb-6.6/hosted-push/backup/` (git dışı) — 79 dosya:
- `functions/` 74 dosya: dört migration'ın create/replace/drop/alter ettiği adların canlıdaki bütün overload'ları (`pg_get_functiondef`, md5, acl). 74/74 dosya md5'i sunucu md5'iyle aynı (`INDEX.tsv`).
- 4 satır dosyası (`rows_*.jsonl`): 12 + 1 + 4 (2 silinen + documents.read/.manage etiket öncesi) + 1 satır; her dosyanın md5'i sunucuda ayrıca hesaplanan md5'le aynı (0f7f2352…, 73bdc780…, b9f23dbe…, cc9cf369…).

### Dört sürüm + md5 (`md5(statements[1])` = repo dosyası md5)
| Sürüm | Ad | md5 | MCP damgası → düzeltilen |
|---|---|---|---|
| 20261006000000 | documents_and_onboarding_ask_the_core (186 540 B) | dc968573ea8ec803d3b642b15f560717 | 20261003043027 → 20261006000000 |
| 20261006010000 | pending_documents_legal_names_one_document_permission | cd64fbd745b50a05ea76a355a77aec54 | 20261003043241 → 20261006010000 |
| 20261006020000 | hidden_rows_count_for_nobody | 09830a1de0935559deef16a236abeaae | 202610030… → 20261006020000 |
| 20261006030000 | unreviewed_uploads_stay_with_deciders | 96c7d697d79b0df10ce55965aa219d91 | 202610030… → 20261006030000 |
Her biri önce scratch dosyaya yazıldı ve repo dosyasıyla bayt bayt karşılaştırıldı (FULL MATCH), sonra aynı metin `apply_migration`'a verildi.

### Advisors farkı
- Security önce/sonra: `rls_enabled_no_policy` 98 INFO, `extension_in_public` 1 WARN (pg_net), `auth_leaked_password_protection` 1 WARN (bilinen muaf). Fark yok.
- Performance önce/sonra: `unindexed_foreign_keys` 237, `unused_index` 55. Bulgu listesi diff'i boş.
- Dosyalar: `advisors-*-before/after.*` aynı klasörde.

### Bağımsız SELECT'ler (sonra)
- `public.permissions` `signature_templates.%`: 0
- `workspace_role_permissions` `signature_templates.%`: 0; owner/admin rollerinde `documents.read` ve `documents.manage`: 12 satır (6 rol × 2)
- `service_actor_can_access_employee`: 0; `document_publication_can_access`: 0; 12 eski köprü: 0
- `app_private.document_submission_visible` var (secdef, acl yalnız postgres); `onboarding.legal_name` eylemi var (`org|write|employee_onboarding.review|no_self|rank_below`)
- `app_private.set_document_exemption`: `prosecdef = false`
- Belge/onboarding/imza/politika/bildirim `public.*_service` (66 fonksiyon): `anon`/`authenticated` execute = 0. Yeni `app_private` fonksiyonları (7): `anon`/`authenticated` execute = 0.
- Etiketler: documents.read = "View documents and acknowledgements", documents.manage = "Manage documents and acknowledgements".

Açılan skill'ler: supabase, supabase-postgres-best-practices (görev mesajındaki gibi).
