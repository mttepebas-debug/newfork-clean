# SEC-YAYIN-HAZIRLIK — yayın öncesi güvenlik şartlarının bugünkü durumu

**ÖZET:** ILERLEME-PLANI §8'deki "açık" iki şart (BL-283, BL-279) ile önerideki iki madde (BL-270, BL-271) kapanmış; tablo bayat. Yayın öncesinde gerçekten açık kalan güvenlik işi beş parça:
1. Settings'in tarayıcıdan doğrudan yazması ve özel müdür rolüne verilebilen organizasyon izinleri (BL-232 + BL-178). Bugün ölçtüm: iki workspace'te lokasyon yetkisi olan biri, kullanılmamış bir lokasyonu öbür workspace'ine taşıyabiliyor.
2. Takas onayında rütbe kuralı yok (BL-276'nın kalan parçası).
3. Bağlantı token'ları adres çubuğunda (BL-351).
4. Hosted e-posta teslimatı ölçülmedi (repodan ölçülemez).
5. Privacy'deki SSN cümlesi ve SSN kalıntısı (BL-382).

Gerisi düşük riskli; yayından sonra da kalabilir. Yeni açık yok; tek yeni ölçüm 1. maddedeki taşıma.

Rol: nf-guvenlik (salt okuma), 2026-10-05 ~07:50Z. Kaynaklar:
- Repo: `origin/main` `6358125b`.
- Yerel DB: son migration `20261007030000`, 427 migration; repodaki son dosyayla aynı, yani yerel DB = main. Yalnız SELECT ve bir geri alınan deneme (aşağıda).
- Hosted'a dokunulmadı. Commit yok.

---

## 1. §8 tablosu ve öneri satırı: tazelik

| Madde | Hüküm | Kanıt (`6358125b` / yerel DB) |
|---|---|---|
| BL-283 API parola deneme sınırı | **bayat — kapandı** | `apps/api/src/auth/verify-password.ts:6`, `:28`, `:40`: `verify_account_password_service` hesap başına sayıyor; aşınca 429 `session.password_attempts_exceeded` |
| BL-279 kurtarma e-postası yeniden gönderme sınırı | **bayat — kapandı** | `account-security-routes.ts:46-52`, `:189-191`; DB'de `claim_account_recovery_resend_service` var |
| BL-270 admin → admin erişim kaldırma | **bayat — kapandı** | `remove_employee_access_service` gövdesi çekirdeğe soruyor; eski yardımcı yok (yerel DB) |
| BL-271 çıkışta önbellek | **bayat — kapandı** | `apps/web/src/auth/AuthContext.tsx:102-107` `queryClient.clear()`; giriş `:261`, çıkış `:304` |
| BL-276 eski yetki kapısı ("32 fonksiyon") | **değişmiş** | eski kapıyı kullanan fonksiyon **10** (32 değil). Belge servisleri ve taslak kaydetme çekirdeğe geçmiş. Açık kalan: takas onayı (aşağıda A2) |
| Hosted e-posta teslimatı / SMTP | **geçerli — ölçülmedi** | repodan ölçülemez (aşağıda A4) |

Öneri: §8 tablosu `nf-planlama` tarafından bu hükümlerle güncellensin.

---

## 2. Yayın öncesi güvenlik paketi (önerilen sıra)

### A1 — Settings'in tarayıcıdan yazması + özel müdür rolüne verilen organizasyon izinleri (BL-232 + BL-178, birlikte)

**Tazelik: geçerli; bir kısmı değişmiş; yeni ölçüm var.**
- Tarayıcı rolünün yazma izinleri: `departments`, `jobs`, `locations`, `shift_labels`, `shift_types` tablolarında INSERT + UPDATE var.
- UPDATE izni `workspace_id`, `id`, `system_key`, `deleted_at`, `created_at` kolonlarını da kapsıyor.
- `workspaces` artık yalnız 8 kolonda UPDATE izni taşıyor (ad, logo); bu kısım değişmiş. `important_dates`'in tarayıcı izni yok.
- Politikalar yalnız `workspace_has_permission(…, 'settings.*.manage')` soruyor. O da eski yardımcı `service_actor_has_permission`: lokasyon kapsamına ve rütbeye bakmıyor.
- Organizasyon izinleri hâlâ özel role verilebiliyor (`custom_grantable = true`): `settings.general.manage`, `settings.locations.manage`, `settings.jobs.manage`, `settings.shift_catalog.manage`, `settings.schedule_rules.manage`, `documents.manage`, `schedule.conflict_rules.manage`, `notifications.settings.write`.
- Mert'in 2026-09-26 kararı bunun tersi: bu izinler yalnız owner ve admin'de kalır.

**Yeni ölçüm (geri alınan deneme, yerel DB, kalıcı iz yok):**
- Kişi: test kullanıcısı `b0000000-…0001`, iki workspace'te `settings.locations.manage` sahibi.
- Tarayıcı rolüyle, hiçbir yerde kullanılmamış bir lokasyonun `workspace_id`'si öbür workspace'e değiştirilebildi: `UPDATE 1`, satır `8ea5d512…`'ye geçti.
- Silme (`deleted_at`) tetikleyiciyle reddedildi: "Use the authorized catalog deletion command."
- Kullanılmış lokasyonlar taşınamaz: 16 bileşik yabancı anahtar `ON DELETE RESTRICT` ile güncellemeyi durdurur.

**Gerçek risk:**
- (a) Kadıköy'deki "Shift Lead" özel rolüne Settings → Roles'tan `settings.locations.manage` verilmişse, bu kişi kendi kapsamı dışındaki Beşiktaş lokasyonunun adresini ve saat dilimini tarayıcıdan değiştirebilir. Saat dilimi bütün vardiya saatlerini kaydırır.
- (b) Aynı izinle `settings.general.manage` alan müdür workspace adını ve logosunu değiştirebilir (çekirdek M2 "hayır" diyor).
- (c) Hem Meyhouse'ta admin hem kendi workspace'inde owner olan Deniz, Meyhouse'ta yeni açılmış ama henüz kullanılmamış "Meyhouse San Jose" lokasyonunu kendi workspace'ine taşıyabilir. Meyhouse'ta lokasyon kaybolur. Bu kiracılar arası bir yazma ve kimse uyarı görmez. Ancak kişinin iki tarafta da yetkisi olması gerekir; başka bir kiracının verisi okunmuyor.

| | |
|---|---|
| Önerilen işaret | **leave: high / do: risky** (bugün medium/risky; (c) ölçüldüğü için yükseltme öneriyorum) |
| Sınıf | **R3** (grant, RLS, yetki) |
| Rol | `nf-backend` (yazmaları API'ye taşımak) → `nf-db` (grant'leri kapatmak, izinleri `custom_grantable = false` yapmak, `retired_objects_stay_gone`) |
| Dilim | FB-6.8 (KK-12) |
| Ultrareview | **evet**; paketin en riskli işi bu |

### A2 — Takas onayında rütbe kuralı yok (BL-276'nın kalan parçası (1))

**Tazelik: geçerli.**
- `shift_exchanges_command_service`: onay ve ret yalnız `schedule_actor_has_capability_service(…, 'schedule.shift_change_requests.manage', lokasyon)` soruyor ("Manager scope required"). `authorize` yok; katalogdaki `exchange.approve` `rank_below` kuralı uygulanmıyor.
- Kendi takasını onaylamak engelli: `shift_exchange_preview` gövdesinde "A separate manager must approve your own exchange".
- Aynı eski yardımcı 5 fonksiyonda: takas önizlemesi, takas bildirimleri, `time_off_event_released_assignments` (BL-179'un kalanı).

**Gerçek risk:** Kadıköy müdürü Ali, aynı lokasyondaki eş müdür Ayşe'nin vardiyasını Hande'ye devreden takası onaylayabilir. KARARLAR P07: eş rütbe birbirinin talebine karar vermez (BL-508 notunda Mert'in sözü: "Kendi pozisyondan arkadaşın değil"). Veri sızıntısı yok; yetki kuralı ihlali var.

| | |
|---|---|
| Önerilen işaret | leave: high / do: risky (değişmedi) |
| Sınıf | **R3** |
| Rol | `nf-db` |
| Dilim | FB-6.4 Takas |
| Ultrareview | ücretsiz hak kalmışsa evet; bittiyse hayır (`nf-guvenlik` yeter) |

### A3 — Bağlantı token'ları adres çubuğunda (BL-351)

**Tazelik: geçerli.**
- Kurtarma bağlantısı `?token=`: `apps/api/src/account/account-security-service.ts:226`, `account-deletion-worker.ts:131`.
- Davet bağlantısı `?token=`: `apps/api/src/employees/employee-create-service.ts:54`, `invitation-service.ts:108`, `:173`, `:224`.
- Parola sıfırlama doğru biçimde fragment kullanıyor (`#token_hash`).

**Gerçek risk:**
- Ayşe'ye gelen davet bağlantısı; web sunucusunun istek kaydına, tarayıcı geçmişine ve ortak bilgisayarın adres çubuğu önerilerine düşer.
- Restoranın ortak bilgisayarında Ayşe'den sonra oturan biri, geçmişteki bağlantıyı açıp daveti kabul edemez: kabul e-posta eşleşmesi istiyor.
- Kurtarma bağlantısında da e-posta / oturum bağı var. Risk orta-düşük; sızan şey tek kullanımlık ve süreli bir kod.

| | |
|---|---|
| Önerilen işaret | leave: medium / do: moderate (değişmedi) |
| Sınıf | R3 (davet ve hesap kurtarma) |
| Rol | `nf-backend` (API bağlantıyı üretir, web fragment'tan okur) |
| Ultrareview | hayır (`nf-guvenlik` yeter) |

### A4 — Hosted e-posta teslimatı ölçülmeli (§8 şartı)

**Tazelik: geçerli, ölçülmedi.** Repodan ölçülemez; görev hosted'a sorgu atmayı yasakladı.

Bilinenler:
- Hesap onay e-postası Supabase Auth'tan gidiyor; Mert 2026-09-28'de "Confirm email"i açtı.
- Davet ve parola sıfırlama e-postaları API'den Resend ile gidiyor; `RESEND_API_KEY` Vercel'de tanımlı (BL-101 notu, 2026-09-30).

**Risk (güvenlik değil, yayını durdurur):** Supabase'in yerleşik SMTP'si çok düşük bir saatlik sınırla çalışıyor ve yalnız proje ekibinin adreslerine gönderiyor. Bu genel bilgim, bu projede ölçülmedi. Doğruysa yeni bir restoran sahibi kayıt olduğunda onay e-postası hiç gelmez.

Ölçüm (Mert ya da koordinatör, dashboard): Supabase → Authentication → Emails / SMTP Settings'te özel SMTP tanımlı mı? Saatlik sınır ne? Tanımlı değilse Resend SMTP'si bağlanır. Resend zaten ödenen servis; ek dolar maliyeti Resend planına bağlı, ölçülmedi.

| | |
|---|---|
| Sınıf | yapılandırma (hosted, kullanıcı onayı) |
| Rol | koordinatör + Mert |

### A5 — SSN: Privacy cümlesi ve veritabanı kalıntısı (BL-382 + prototip Q5)

**Tazelik: geçerli.**
- `apps/web/src/public/PublicTrustPages.tsx:97-99` "an encrypted SSN field".
- `apps/api/src/employees/onboarding-routes.ts:68-72` 410 ucu.
- `employee_sensitive_identifiers` tablosu duruyor: 0 satır, RLS açık, tarayıcıya izin yok (yalnız `service_role` SELECT).

**Gerçek risk:** veri yok ve tarayıcıdan erişim yok. Risk yalnız herkese açık gizlilik metninin yanlış beyanı. Örnek: Meyhouse'u kuran owner Privacy'yi okur ve çalışanlarına SSN isteneceğini söyler.

| | Metin | Tablo + uç |
|---|---|---|
| Önerilen işaret | leave medium / do safe | leave low / do moderate |
| Sınıf | R0 (koordinatör, tek satır) | R3 (veri silme) |
| Rol | koordinatör | `nf-db` + `nf-backend` |
| Ultrareview | hayır | hayır (tablo boş, `nf-guvenlik` yeter) |

---

## 3. Yayından sonra kalabilir (düşük risk; yayını durdurmaz)

| Madde | Tazelik | Gerçek risk (örnek) | İşaret önerisi | Sınıf / rol |
|---|---|---|---|---|
| BL-276 kalan 10 eski-kapı fonksiyonu (bildirim ayarları, owner kurulum listesi, rol kaydetme) | değişmiş (10) | Rol kaydetme `can_edit_role` ile owner/admin rütbesine bakıyor. Bildirim ve kurulum listesi düşük etkili. Kapalı workspace kontrolü yok. | low / moderate | R3 / `nf-db`, ilgili dilimde |
| BL-374 + BL-565 rota-yerel yetki kapıları (Settings rotaları, ekip müsaitliği) | geçerli (`organization-settings-routes.ts:177`, `:193`; `roles-routes.ts:106`; `weekly-preferences-routes.ts:56`) | Bugün çekirdekle aynı cevap; kural değişince ayrışabilir. Sızıntı ölçülmedi. | medium / risky (değişmedi) | R3 / `nf-backend`, G11 |
| BL-383 gövde, yetkiden önce doğrulanıyor (84 rota) | madde metnine göre; yeniden sayılmadı | Yetkisiz kişi 400 ile alan adlarını öğrenir; bu adlar zaten web paketinde açık. | **low** / moderate (medium'dan düşürme önerisi) | R2 / `nf-backend`, G11 |
| BL-401 davet bağlantısında "izin yok" ile "bulunamadı" farkı | geçerli (yerel DB gövdesi: 42501 `authz.rank`, sonra P0002) | Müdür Ayşe, Ali'ye admin daveti gönderildiğini anlar. | low / safe | R3 / `nf-db`, G11 |
| BL-419 kurulumu bitmemiş workspace'ten API ile davet | geçerli (`apps/api/src/app.ts:544` rotada kurulum kontrolü yok); Mert kararı "kurulum bitmeden davet yok" | Owner yalnız doğrudan API çağrısıyla davet gönderebilir; web'de kapalı. | low / moderate | R3 / `nf-backend` |
| BL-390 çıkıştan sonra yolda olan kaydetmenin cevabı yeni kişinin önbelleğine | madde metnine göre | Pencere çok dar, gösterilmedi. | low / moderate | R1 / `nf-backend` |
| Prototip Q1: paylaşılan cihazda önceki kişinin son sayfasına inme | geçerli (`ProtectedRoute.tsx:25-32`, `SignInPage.tsx:22-24`) | Yalnız sayfa adresi; önbellek temiz, açık yönlendirme yok (`SignInPage.tsx:195-205`). | low / safe | R1 / `nf-backend` |
| BL-508 izin ilerlemesi oy veremeyen okuyucuya gidiyor | madde metnine göre; Mert'le konuşma bekliyor | Kapsam dışına sızma yok. | low / safe | R3 / `nf-db`, karardan sonra |
| BL-352 davet teslim sırrı düz metin | geçerli (tablo `token` kolonu; tarayıcıya izin yok) | Yalnız veritabanı erişimi olan görür. | low / safe | R3 / `nf-db` |
| BL-360 silinen workspace'in logosu depolamada kalıyor | madde metnine göre | Saklama ve gizlilik artığı. | low / safe | R2 / `nf-backend` |
| BL-336 davet token'ı e-posta onayında kayboluyor | geçerli (kod) | Güvenlik değil, akış. | — | — |

---

## 4. Önerilen sıra (plan; iş açılmaz)

| Sıra | İş | Neden bu sırada |
|---|---|---|
| 1 | **A4** hosted e-posta teslimatı ölçümü | Dakikalık iş. Sonucu yayının yapılıp yapılamayacağını belirler; kod gerektirmeyebilir. |
| 2 | **A5 metni** (Privacy SSN cümlesi) | Tek satır, R0; herkese açık yanlış beyanı hemen kapatır. |
| 3 | **A1** BL-232 + BL-178 (FB-6.8) | Ölçülen tek kiracılar arası yazma. Grant ve politika işi; sırası `nf-backend` → `nf-db`. **Ultrareview burada.** |
| 4 | **A2** takas rütbesi (FB-6.4) | Yetki kuralı ihlali; kendi dilimiyle birlikte. |
| 5 | **A3** BL-351 token'ları fragment'a | Davet ve kurtarma; tek iş. |
| 6 | A5'in veritabanı kısmı (BL-382) | Boş tablo; acelesi yok, yayından önce temizlik. |
| 7 | Bölüm 3 | Yayından sonra; G11 ve ilgili dilimlerle. |

**Ultrareview:** kalan ücretsiz hakkı bilmiyorum; açılış penceresi gösteriyor. Hak bittiyse yalnız A1'de önerilsin. Tutarı açılış penceresinden okunup öneride dolar olarak yazılmalı; tahmin etmedim.

## Açık kalan ve nedeni
- Hosted hiç ölçülmedi (görev yasağı): A4, hosted grant'lerin yerelle aynı olup olmadığı, Vault'taki cron sırları.
- BL-383, BL-390, BL-508, BL-360 madde metnine göre yazıldı; kodda yeniden ölçülmedi.
- A1(c) denemesi yalnız lokasyonda yapıldı. Jobs, departments, shift types ve shift labels'da da `workspace_id` güncellenebilir; aynı sonucun çıkması beklenir ama denenmedi.

## Ekranda ne değişti
Hiçbir şey; salt okuma.

## Kanıt (2026-10-05, bu oturumda)
| Komut | Sonuç |
|---|---|
| `git fetch` + BACKLOG / ILERLEME-PLANI okuma (`6358125b`) | §8 ve BL-270/271/276/279/283/178/179/232/351/374/382/383/401/419/565 metinleri |
| Yerel DB: `max(version)` | `20261007030000`, 427 = repo |
| `pg_proc` içinde `service_actor_has_permission` kullanan | 10 fonksiyon |
| BL-276 parçaları: gövdede `authorize\|authz_check\|scope_set` var mı | belge ×3, taslak kaydetme, erişim kaldırma: evet; takas ve izin olayı: hayır |
| `permissions.custom_grantable` | 8 organizasyon izni `t` |
| `information_schema` grant'leri + `pg_policies` | 5 katalog tablosunda INSERT/UPDATE, `workspace_id` dahil |
| Geri alınan deneme (`begin … rollback`, `set local role authenticated`) | taşıma `UPDATE 1`; silme tetikleyicide reddedildi |
| `git grep` (`verify_account_password_service`, `claim_account_recovery_resend_service`, `?token=`) | 1. ve 2. bölümdeki satırlar |
