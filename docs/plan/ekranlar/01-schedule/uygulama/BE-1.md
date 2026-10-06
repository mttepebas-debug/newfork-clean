# BE-1 — API yetki temizliği

| Ekran | Dilim | Rol / oturum | Sınıf | İnceleme kararı | Tarih |
|---|---|---|---|---|---|
| Schedule | EKRAN-01 BE-1 | nf-backend / web hattı | R3 | ONAY @6e09e1ae (`nf-guvenlik`; rebase sonrası `range-diff` aynı) | 2026-10-06 |

## Sonrası için
- Tuzak: `PATCH /shifts/publish` gibi silinen bir adres `PATCH /shifts/:shiftId`'ye düşer; emekli rota "404 döner" diye değil, kayıt listesinde yok diye sınanır (`schedule-routes-gate.test.ts` "Retired Schedule routes").
- Tuzak: tek başına Fastify ile kurulan rota testinde `app.setErrorHandler(replyWithError)` yoksa `HttpError`'ın `reason`'ı cevaba girmez.
- Kalıp: bir API rotasının kullanılıp kullanılmadığı, web kaynağındaki `/schedule`, `/shifts`, `/v1/workspaces` ile başlayan yol metinleri (test dosyaları hariç) taranarak ölçülür; çok satırlı çağrılar yüzünden yalnız `Request(` kalıbı yetmez.
- Ölçüm: `apps/api/src/schedule/schedule-routes.ts` 2638 → 1433 satır; API vitest 1103 → 983 (2026-10-06, `07d8cea3`).
- Karar adayı: dışa aktarma kuralını kimin düzenleyeceği (BL-494) API'de değil veritabanında; kapısı DB'de olan iş baştan veri hattına yazılmalı.

## Rapor
### EKRAN-01 BE-1 — rapor (web hattı, nf-backend)

**Karar:** `nf-guvenlik` ONAY @6e09e1ae (rebase sonrası yamalar aynı) · sınıf R3
**İzin:** R3 — "gönder" izni bekliyor (main kırmızıyken zaten donuk)
**Risk:** 🟢 çoğu silme; web'in hiç çağırmadığı 41 rota gitti, kalan Export kontrolü artık diğer rotalar gibi yetki çekirdeğine soruyor
**Soru:** yok (BL-494 veri hattına yönlendirme önerisi aşağıda)
**Sonraki:** BE-2 (CSV formül açığı, e-postanın kısmi teslimi, ham hata metni, `confirm_scope`)

Delegasyon: R3; `nf-guvenlik` incelemesi **ONAY @6e09e1ae** (rebase sonrası aynı yamalar: `git range-diff` üçü de "=", yeni sha'lar `d21afc44`, `dd6b9b5e`, `92de9f85`; üstüne yalnız 2 boş satır silen `07d8cea3`). Görsel QA yok (ekran değişmedi).
Dal `task/ekran-01-be-1` (worktree `.claude/worktrees/optimistic-dewdney-c78421`). Main'e gönderilmedi; **"gönder" izni bekleniyor.** Ultrareview önerisi: yetki yüzeyi ama diff çoğunlukla silme ve iki iç incelemeli değil, tek `nf-guvenlik` ONAY'ı var; Mert'in "iki inceleme yeter" çizgisine göre önermiyorum.

#### 1. Nerede duruyor
B-5 ve B-8 bitti, inceleme onaylı, tam kapı yeşil. **BL-494 bu dilimde yapılamadı**: kapı veritabanında, veri hattına gitmeli (aşağıda).

#### 2. Ne yapıldı (etkisi)
- **B-5 — Export önizlemesinin yetkisi çekirdekte.** Schedule → Export panelini açınca çağrılan kontrol (`POST /v1/workspaces/:id/schedule/export-v2/authorize`) artık rolü ve izin listesini kendisi okumuyor; diğer bütün Schedule rotaları gibi yetki çekirdeğine soruyor. Sonuç:
  - Workspace'in üyesi olmayan (ya da başkasının workspace kimliğini deneyen) 404 "not a member" alıyor, 403 değil; bilinmeyen ve yabancı workspace aynı cevabı alıyor.
  - Eylemi olmayan 403 `authz.out_of_scope`.
  - Kapı artık gövde doğrulamasından önce; üye olmayan gövde hatasından bilgi alamıyor.
  - Bu rotanın tek başına kullandığı eski kapı fonksiyonu (`resolveAuthorizedWorkspaceContext`) silindi (ikiz sistem yok).
  - `nf-guvenlik` eski dört kontrolü (aktif üyelik, belge kısıtı, çalışan rolü, izin) çekirdekte tek tek doğruladı. Tek fark: kurulumu bitmemiş workspace'in yalnız sahibi önizlemeyi onaylatabiliyor; canlı `POST /schedule/export` zaten böyle, iki kapı tutarlı.
- **B-8 + D-D5 — 41 ölü ikiz rota silindi.** Web, e2e, scripts, `api/` ve `vercel.json` hiçbirini çağırmıyordu (ölçüm + `nf-guvenlik` taraması). Silinenler:
  - `/v1/workspaces/:id/schedule/*` ailesi (default-hours ve export-v2 hariç);
  - `PATCH /shifts/publish` — yayın penceresindeki istisna onaylarını atlıyordu;
  - `POST /schedule/drafts/:id/auto-fill/preview|apply` — açık düzenlemeyi atıp kaydedilmemiş işi siliyordu;
  - `POST /schedule/edit-session/discard`, `GET /shifts`, `POST /schedule/edit-session/materialize-live-draft` (+ web'deki çağrılmayan `materializeLiveScheduleDraft`);
  - ölü `getPublicationHistory` servis yöntemi ve shared şeması.
  - Bu rotaların davranış testleri yaşayan ikizlerine taşındı (beklenti gevşemedi; `nf-guvenlik` doğruladı).
  - Rota tablosu testine "emekli 41 rota kayıtlı değil" kilidi eklendi; Export v2 tek-kapı tablosuna girdi.
- **Öncesi / sonrası:** Export paneli (Schedule → Export) eskiden kendi rol kontrolüyle açılıyordu, şimdi bütün Schedule ekranıyla aynı tek kapıdan; API'de aynı işi yapan iki rota çifti vardı, şimdi tek.
- `schedule-routes.ts` 2638 → 1433 satır (K-1'in "< 1500" hedefi bu dosya için kendiliğinden tuttu).

#### Done when
1. `rg "permissions.includes|role === \"employee\"" apps/api/src/schedule` Export'ta boş ✓ (kalan tek eşleşme Requests rotasında: `schedule-requests-routes.ts:129,150`, EKRAN-02'nin işi).
2. Üye olmayan 404, kapsam dışı 403 `authz.out_of_scope` ✓ (`schedule-export-v2-routes.test.ts` + `schedule-routes-gate.test.ts`).
3. **Owner, Ayşe'nin Moda kuralını düzenleyebilir; arşivli kuralı müdür düzenleyemez — YAPILMADI, veri hattına.** Kapı veritabanında, satır içi kuralla: `update_schedule_export_schedule_service` ve silme servisi `s.created_by = actor_user_id` diyor (`20261003000000_an_archived_location_counts_nowhere.sql:847-852`); preset kontrolü de `p.created_by = actor_user_id`, yani owner Ayşe'nin presetini kullanan kuralı kaydedemez. API'de ayrı kapı yok; değişiklik tamamen `supabase/**`. Görev dosyası da "kapı veritabanındaysa nf-db ile; sıra nf-db önce" diyor. `nf-guvenlik`: "BL-494 doğru tespit". API tarafında sonra yapılacak bir şey görünmüyor; DB değişirse API testi eklerim.
4. Silinen rotalar yok ✓ (kayıt düzeyinde test; `PATCH /shifts/publish` adresi artık `PATCH /shifts/:id`'ye düşüp kapıdan geçtikten sonra 400 alıyor).

#### Kanıt
- `pnpm.cmd --filter @newfork/api exec vitest run` (BE-1 dalı, rebase öncesi): 59 dosya, 986 test geçti (önceki 1103'ten fark: rota tablosunda 41 rota × 3 kapı testi + silinen ikiz testleri).
- `nf-guvenlik` kendi kopyasında `vitest run src/schedule src/auth src/app.test.ts` 347 test geçti; api ve web typecheck temiz.
- Tam kapı (rebase sonrası, `07d8cea3`, 2026-10-06): lint + typecheck yeşil; `pnpm.cmd test` ilk koşuda shared `timezones.test.ts` 5 sn zaman aşımına düştü (CI yükü altında; dosya bu dala dokunmuyor), boşta tek başına 209/209 geçti; yeniden `test && build`: EXIT=0 — ui 9, shared 209, api 983, web 2165 (+1 atlanan).
- E2E: API rotası silmesi, web akışı değişmedi; etkilenen e2e yok. Gönderimde Schedule e2e'si yeniden koşulur.

#### 3. Açık kalan ve nedeni
- **BL-494 → veri hattı (`nf-db`).** Yukarıdaki nedenle. Öneri: veri hattının sırasına "BL-494 dışa aktarma kuralı kapısı çekirdeğe" maddesi; kural: owner/admin her kuralı, müdür yönettiği lokasyonların kurallarını (kim kurduysa), bütün lokasyonları arşivli kuralı yalnız owner/admin; preset kontrolü de buna göre.
- **Veritabanında ölü kalan `get_schedule_publication_history_service`** → `nf-db`: sil + `retired_objects_stay_gone`; iki pgTAP dosyası (`authorization_coverage`, `schedule_publication`) hâlâ kapsıyor.
- **Disk artığı:** `nf-guvenlik` geçici kopyasını `C:\tmp\nfg-be1`'e açtı; git kaydı silindi ama klasör diskte kaldı (hook silmeyi durdurdu). Repo dışı, zararsız; koordinatör ya da Mert elle silebilir.

#### 4. Ekranda ne değişti
Görünürde bir şey değişmedi. Export paneli aynı çalışıyor; yalnız workspace'e erişimi olmayan biri artık "yok" cevabı alıyor.

#### 5. Sırada ne var
- Gönder izni gelince: `main.lock`, rebase, tam kapı, push, main CI.
- Sonra **BE-2** (aynı dosyalar, BE-1'in üstüne). Tazelik başladı: B-6 geçerli (`schedule-export.ts:449` `csvCell` `= + - @`'i etkisizleştirmiyor), BL-685 geçerli (`confirm_scope` shared ve web'de yok), D-D4 (`schedule-export-cron.ts`) okunacak.
- Yolda bulunan: yok (ölü materialize ucu BE-1'e alındı; görev dosyasının D-D5 listesinde vardı).

Skills: superpowers:test-driven-development (kırmızı test önce: B-5'in 404/403 testi, emekli rota kilidi).

#### Hafıza notu (incelemeciden, dosyaya yazılmadı)
- Paylaşılan worktree inceleme sırasında başka dala geçebilir; inceleme `git show <sha>` ile okunmalı.
- Geçici worktree uzun yol hatası yüzünden scratchpad'e kurulamıyor; kısa yol (`C:/tmp`) gerekiyor.

## İnceleme

### nf-guvenlik — KARAR: ONAY @6e09e1ae
KARAR: ONAY @6e09e1ae

Kritik ya da Yüksek bulgu yok. Üç commit inceledim: 432f1cae, 560bbae3 ve sonradan eklenen 6e09e1ae.

**Önemli bir uyarı:** inceleme sürerken bu worktree başka bir dala geçirildi. Worktree şu an `task/ekran-01-w-1a` dalında (HEAD aee42edf). Bu yüzden kararı worktree'deki dosyalara değil, `git show 6e09e1ae` ile okuduğum içeriğe ve kendi geçici kopyamda koşan testlere dayandırdım. Worktree'de checkout yapmadım.

#### B-5: Dışa aktarma ön onayı artık yetki çekirdeğine soruyor (432f1cae + 560bbae3)

Bu, Schedule ekranında dışa aktarma önizlemesi açılırken çağrılan kontrol (`POST /v1/workspaces/:id/schedule/export-v2/authorize`). Eski kontrolün yaptığı dört işi çekirdek nasıl karşılıyor, tek tek baktım:

| Eski kontrol | Şimdi kim karşılıyor | Sonuç |
|---|---|---|
| Üyelik aktif mi | Çekirdek aktif olmayan üyeye "not_active" der; çözücü zaten yalnız aktif üyeyi döndürüyor | Karşılanıyor |
| Kısıtlı kişi (belgesi eksik) | Çekirdek "document_blocked" der. Dışa aktarma eylemi kısıtlı kişiye açık işaretli değil (`authorization_core.sql:238`) | Karşılanıyor: kısıtlı kişi dışa aktaramaz |
| Rol `employee` ise ret | Çekirdek çalışan rütbesine her durumda "missing_permission" der | Karşılanıyor |
| `schedule.export` izni var mı | Çekirdek aynı izni kontrol ediyor | Karşılanıyor |

Gözle doğruladığım iki şey daha var:
- **Başka workspace:** yanlış biçimli kimlik, üye olunmayan workspace ve başkasının workspace'i aynı cevabı alıyor: 404 `authz.not_member`. Kapı artık gövde doğrulamasından önce çalışıyor, yani üye olmayan kişi gövde hatasından da bir şey öğrenemiyor.
- **Ekip içi kapsam:** seçilen lokasyon, çalışan, taslak ve vardiya kontrolleri değişmedi.

**Düşük, bilgi notu — onboarding kontrolü düştü.** Eski kontrol "workspace kurulumu bitmemiş" durumu da reddediyordu. Kurulumu süren (taslak) bir workspace'e çekirdek yalnız sahibine kapı açıyor (`workspace_open_to_actor`). Yani artık yalnız şu değişti: taslak workspace'in sahibi, kendi workspace'inin dışa aktarma önizlemesini onaylatabilir. Başka kimse bu yoldan geçemez ve başka workspace'e sızıntı yok. Canlı dışa aktarma rotası (`POST /schedule/export`) zaten aynı kuralla çalışıyor, iki kapı birbiriyle tutarlı oldu. Düzeltme gerekmiyor.

#### B-8: 41 ölü ikiz rota silindi (560bbae3 + 6e09e1ae)

**Silinen rotaları kullanan var mı?** Yok. 6e09e1ae'de `apps/web`, `e2e`, `scripts`, `packages`, `api/` ve `vercel.json` taradım:
- `vercel.json`'da zamanlanmış görev (cron) tanımı yok; yalnız yönlendirme var.
- `api/` klasörünün içinde "schedule" geçen bir şey yok.
- Web'de kalan `/v1/workspaces/...` çağrıları yalnız default-hours ve export-v2. İkisi de yaşayan rotalar.
- Silinen `materializeLiveScheduleDraft` main'de de hiç çağrılmıyordu. Main'de bu rotalara başvuran tek yer bu tanımın kendisiydi.
- Paralel açık dallarda (W-1a, db-1a, ekran-02, ekran-03) bu rotalar yalnız main'den gelen tanım ve testlerde geçiyor. Web kodunda çağıran yok. Ancak W-1a dalı rebase olurken `app.test.ts` ve rota tablosu testinde metin çakışması çıkabilir.

**Arkada yetki boşluğu kalan rota var mı?** Yok. Kalan 46 Schedule rotası tek kapıdan geçiyor (`authorize(resolveActor)`). Rota tablosu testi kayıtlı rotaların tam listesini kilitliyor; yeni bir rota tabloya girmeden kapıyı atlayamaz. 41 emekli rota da ayrı bir listeyle "geri gelmesin" diye kilitli. Silinen `PATCH /shifts/publish` yayın onay adımlarını atlıyordu; silinmesi güvenliği artırıyor. O adrese gelen istek artık `PATCH /shifts/:id` rotasına düşüyor; önce kapıdan geçiyor, sonra kimlik doğrulamasında 400 alıyor.

**Taşınan testler gevşedi mi?** Hayır, aynı davranışı yaşayan rotalarda sınıyorlar:
- Ölü rotaların davranış testleri yaşayan rotalara taşındı: `/shifts`, `/shifts/:id/restore`, `/schedule/drafts/save`, `/schedule/publish(-preview)`, `/schedule/templates`, `/schedule/export/preview`. Beklentiler korunmuş.
- Oturumu bırakma (`edit-lock/release`) için beklenen cevap 200'den 204'e değişti; bu o rotanın gerçek sözleşmesi. Servise giden çağrı hâlâ ayrıca doğrulanıyor (`app.test.ts:2996`).
- Silinen beklentilerin hepsi silinen rotalara aitti.
- Dışa aktarma testine iki yeni test eklendi:
  - Çekirdek eylemi vermezse 403 `authz.out_of_scope`.
  - "Rol employee ama çekirdek izin veriyor" ise 200, yani rota artık rolü kendisi okumuyor.
- Eski davranışa dönülürse rota tablosu testi kırılır: gövdesiz istekte 404 yerine 400 döner.

#### Kapsam dışı sorular

- **BL-494 doğru tespit.** Dışa aktarma kuralını kimin düzenleyebileceği, veritabanındaki `update_schedule_export_schedule_service` içinde satır içi kuralla belirleniyor (`s.created_by = actor_user_id`, `20261003000000_an_archived_location_counts_nowhere.sql:847-852`). API'de ayrı bir kapı yok. Düzeltmesi `nf-db` dilimine gider.
- **`get_schedule_publication_history_service` artık kimse tarafından çağrılmıyor.** Hâlâ iki pgTAP dosyasında kapsanıyor (`authorization_coverage`, `schedule_publication`). `nf-db` diliminde silinmesi ve `retired_objects_stay_gone` listesine eklenmesi yeterli.

#### Öneri (zevk notu)
- 6e09e1ae, `schedule-routes.ts`'te sildiği bloğun yerine bir boş satır daha bırakmış; heartbeat rotasından önce iki boş satır var. Kozmetik.

#### Kanıt
Testleri kendi geçici kopyamda koştum: `C:/tmp/nfg-be1`, 6e09e1ae'ye ayrık açılmış bir worktree (uzun yol hatası yüzünden bu kısa yolu seçtim).
- `pnpm.cmd install --offline --frozen-lockfile`, ardından shared ve ui derlemesi: tamam.
- `pnpm.cmd --filter @newfork/api exec vitest run src/schedule src/auth src/app.test.ts`: 11 dosya, 347 test geçti. Rota tablosu testi tek başına 138 test.
- `pnpm.cmd --filter @newfork/api --filter @newfork/web typecheck`: ikisi de temiz.
- Tam kapı, `test:db` ve e2e görev gereği koşulmadı.

**Temizlik:** geçici worktree'nin git kaydı silindi (`git worktree list`'te yok). Ama `C:\tmp\nfg-be1` klasörü diskte kaldı: önce `--force` reddedildi, sonra klasör boş olmadığı için silme yarıda kaldı, PowerShell ile silmeyi de bir hook durdurdu. Repo dışında, zararsız bir artık; elle silinebilir.

#### Hafıza notu (dosyaya yazılmadı)
- İncelenen worktree başka bir oturumla paylaşılıyorsa inceleme sırasında dala geçirilebilir. Bu yüzden her okuma `git show <sha>` ya da `git grep <sha>` ile yapılmalı.
- Geçici worktree, uzun yol hatası yüzünden scratchpad'e kurulamıyor. Kısa bir yol kullanılmalı (ör. `C:/tmp`).
