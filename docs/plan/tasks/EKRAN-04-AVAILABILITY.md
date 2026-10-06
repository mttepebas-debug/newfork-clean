# EKRAN-04 Availability — ekranı "bitmiş" tanımına getirmek
Status: draft — 2026-10-06 (`nf-planlama`, koordinatörün gece görevi; ekran planının 4. adımı).
Session: -   Branch: task/ekran-04-<dilim>   Worktree: newfork-wt/ekran-04-<dilim>   DB: A1 ve D `db.lock` ile
Reviewer: dilim başına (aşağıdaki tablo). B1 `nf-guvenlik` zorunlu (rota yetki kapısı kalkıyor); ekran değişen C1 `nf-gorsel-qa`.
Risk sınıfı (toplam): **R3** — B1 API rotasının kendi izin kontrolünü kaldırıp çekirdeğe bırakıyor (CLAUDE.md §9); geri kalanı R2 (okuma fonksiyonu, bildirim, tetikleyici).
Hat sırası (koordinatör, 2026-10-06): **EKRAN-03'ten sonra** — veri hattı EKRAN-03 A1–A4 bitince A1; web hattı EKRAN-03 B'den sonra B1; arayüz hattı EKRAN-03 C'den sonra V / C1.

**Kaynaklar:** keşif `docs/plan/ekranlar/04-availability/OZET.md` (E4-01…E4-22, §2 prototip, §3 K1–K6, §4 S1–S3) ve `A-backlog-prototip.md`, `B-guvenlik.md`, `D-kod-davranis.md`; KARARLAR "Müsaitlik" (M1–M14, Tasarım seçimleri), satır 69 / 72 / 73 (KK-178 düzeltmesi), Genel → "Liste sayfalarının ortak dili" (Sistem 1, sayfalama); KK-178. **`C-gorsel.md` henüz yok** (makine boşalınca); C1 başlamadan önce okunur, bulguları C1'e eklenir.

**Tazelik 2026-10-06 (`origin/main` `75ba8cc5`):** keşif aynı gün; `apps/ packages/` keşiften bu yana değişmedi (`git diff --stat b5fabb27 origin/main -- apps packages` boş). Dilim başlarken kendi ölçümünü yapar.

## Goal
Availability ekranını (sol menü → Availability: durum sekmeleri, lokasyon süzgeci, arama, haftalık tablo; satırdan açılan Employees çekmecesinin Availability bölümü ve Manager note; Settings → Scheduling'deki giriş modu; bunların API, DB ve bildirimleri) EKRAN-PLANI'nın "bitmiş sayılır" tanımına getirmek.

Bir kişi için: Kadıköy müdürü Ayşe Availability'yi açar; listede yalnız müsaitlik giren çalışanlar var, müdür Can ve owner Mert "Not submitted" diye görünmez. 80 kişide ilk 50 kişi, altta "1 2". Ali hiçbir şeyi değiştirmeden Save'e basarsa Ayşe'ye bildirim gitmez. Çekmecede not "Manager note" adıyla, altında "Last edited by Ayşe Yılmaz · Oct 6".

## Ürün kuralları (yazıldığı gibi uygulanır)
- **KK-178 (koordinatör, 2026-10-06; dayanak OZET §3):**
  - **K1** — liste ve sayı yalnız `employee` rolünü gösterir; müdür, admin, owner listeden ve "N employees"tan çıkar; `weekly_team_availability.test.sql:58` bugünkü kurala göre yeniden yazılır (KARARLAR M13, M14; P01).
  - **K2** — notun adı "Manager note"; çekmecede notun altında "Last edited by <ad> · <tarih>" (KARARLAR "Manager note", Schedule kartı).
  - **K3** — değişikliksiz yeniden kayıt bildirim üretmez; ilk kayıt ("Week confirmed") üretir (anti-hedef "bildirim gürültüsü", P07).
  - **K4** — mod değişikliği bildirimi haftası olmayana "Check your availability" der, "converted" demez (P21).
  - **K5** — KARARLAR 69, 72, 73 M13/M14'e göre düzeltildi (main, KK-178).
  - **K6** — arşivli lokasyondaki atama "lokasyonsuz" sayılır; kişi owner'ın listesinde görünür (KARARLAR "arşivli lokasyon hiçbir yerde sayılmaz").
- **Sayfalama bu turda** (BL-787; Mert 2026-10-06, KARARLAR Genel): 25 / 50 / 100, varsayılan 50, sayfa numaraları; ortak bileşen EKRAN-02 C3'ten.
- **M1–M14 ve "Tasarım seçimleri"** değişmez (M8: müsaitlik hiçbir yazmayı engellemez; M2: müdür çalışanın haftasını yazamaz; M14: terfide silinir).

## Açık sorular (CLAUDE.md §13; sabah Mert'e — metin OZET §4'te)
- **S1** — yönetici Employee view → My availability: sekme gizlensin mi (önerilen), tek cümle mi, bugünkü gibi mi. → BL-796, C1.
- **S2** — telefonda Availability: kart satırı / yana kayan tablo / telefonda kapalı; gerçek ekranda varyant (P04). → V, C1, BL-599.
- **S3** — vardiya tipinin saati değişince işaretli müsaitlik sessizce kaysın mı (önerilen: kayar + çalışana bildirim). → A1 (bildirim eklenirse).
- Cevap gelmeden yalnız ilgili kısım bekler; dilimin geri kalanı yürür.

## Bulgu → dilim eşlemesi
| Bulgu | Dilim | Backlog |
|---|---|---|
| E4-01 liste yönetici, admin, owner (K1) | A1 + C1 | BL-789 |
| E4-02 değişikliksiz kayıt bildirimi (K3) | A1 | BL-790 |
| E4-03 kilit izin / vardiya tipi kaydını reddediyor | A1 (önce ölçüm) | BL-791 |
| E4-04 yöneticide kilitli form | C1 (S1) | BL-796 |
| E4-05 sayfalama | A1 + B1 + C1 | BL-787 |
| E4-06 rota izin kapısı, ham "access required" | B1 | BL-565 |
| E4-07 telefonda tablo | V + C1 (S2) | BL-599 |
| E4-08 e2e yok | D | OBS-002 |
| E4-09 arşivli lokasyon (K6) | A1 | BL-792 |
| E4-10 davetli adaya not | EKRAN-03 A2 kapatır (BL-773); A1'de yalnız hücre | BL-773 |
| E4-11 terfide not kopyası | A1 | BL-569 |
| E4-12 terfi / kayıt yarışı | A1 | BL-567 |
| E4-13 tetikleyici yolu | A1 | BL-153 |
| E4-14 409 sonrası yenilenmiyor | B1 | BL-797 |
| E4-15 ham hata cümleleri | B1 | BL-621 + BL-798 |
| E4-16 Manager note adı, Last edited by (K2) | B1 (veri) + C1 | BL-799 |
| E4-17 mod bildirimi metni (K4) | A1 | BL-793 |
| E4-18 "1 employees" | C1 | BL-661 |
| E4-19 uyarı ucu 403 → 404 | B1 | BL-794 |
| E4-20 KARARLAR satırları | bitti (KK-178) | — |
| E4-21 önizleme sayfası | C1 | BL-800 |
| E4-22 BL-262 Availability kısmı | kapandı (Settings yarısı Settings turunda) | BL-262 |
| Prototip taşı: AV3, AV11, PHONE A1 | C1 | BL-661, BL-599 |

## In scope (dilimler)
Sıra kuralı (CLAUDE.md §4): veri önce, sunum sonra; aynı dosyaya iki oturum aynı anda konmaz.

### V — S2 telefon varyantları (`nf-arayuz`; R1, main'e girmez)
- **Ne:** gerçek uygulamada DEV'de query param ile 2–3 varyant (kart satırı, yana kayan tablo + yapışkan ad sütunu, telefonda kapalı), 390 px; Mert seçer.
- **Done when:** ekran görüntüleri `artifacts/nf-arayuz/EKRAN-04/varyant/`; seçim KARARLAR'a yazıldı (koordinatör); dal silindi.

### A1 — Okuma, bildirim ve terfi kuralları (`nf-db`; R2)
- **Ne:** K1 (`weekly_team_read_service` yalnız employee; sayı aynı); K6 (arşivli lokasyon = lokasyonsuz); K3 (değişikliksiz kayıtta bildirim yok); K4 (mod bildirimi iki metin); sayfalama için okuma (offset ya da sıralama anahtarı + toplam sayı, 25 / 50 / 100, ad sırası sunucuda); BL-569 (terfi tetikleyicisi geçmiş / komut tablosunda `source` süzgecini bırakır); BL-567 (employee olmayana hafta yazılamaz kısıtı ya da terfi tetikleyicisinin aynı kilidi alması — yarış kapanır); BL-153 (`employee_profiles.user_id` bağlanma yolu); BL-791 önce ölçülür (yayın kilidi kaç saniye, kaç çarpışma), ölçüm kanıtı Notes'a; düzeltme gerekiyorsa bekleyen kilit (`pg_advisory_xact_lock`) ya da kısa bekleme — teknik karar `nf-db` (P19). S3 (a) seçilirse vardiya tipi saat değişince çalışana bildirim.
- **Touches:** `supabase/migrations/<yeni>.sql`, `supabase/tests/weekly_team_availability.test.sql`, `availability_follows_role.test.sql`, yeni `weekly_team_paging.test.sql`, `ci-green.txt`.
- **Bağımlılık:** EKRAN-03 A1–A4 main'de (hat sırası; aynı `authorization_matrix` / `ci-green.txt`).
- **Done when:** (a) owner, müdür ve admin Team listesinde 0 satır, employee'ler tam (pgTAP; `:58` yeniden yazıldı, önce kırmızı); (b) arşivli lokasyondaki kişi owner listesinde lokasyonsuz (pgTAP); (c) değişikliksiz ikinci kayıtta `availability.weekly_updated` 0, ilk kayıtta 1 (pgTAP, alıcı sayımı); (d) haftası olmayana mod bildirimi "Check your availability" (pgTAP); (e) terfi sonrası `weekly_preference_events` / `commands`'ta o kişinin satırı 0 (pgTAP); (f) 120 kişide 50'lik sayfalar birleşince 120 farklı kişi, sayı 120 (pgTAP); (g) BL-791 ölçümü Notes'ta.
- **Test plan:** kırmızı pgTAP → migration (rollback denemesi) → `test:db` (`db.lock`, tek ağır iş).
- **Reviewer:** tek bağımsız inceleme; BL-567 kısıtı veri şekline dokunursa `nf-guvenlik`.

### B1 — API, shared, web veri katmanı (`nf-backend`; R3)
- **Ne:** BL-565 (rota içi `permissions.includes("availability.read")` kalkar, karar çekirdekte; "hayır" sözleşmesi `authz.*`); BL-794 (uyarı ucu üye olmayana 404); sayfalama parametreleri (`page`, `page_size` yalnız 25 / 50 / 100); K2'nin verisi (çekmece okuması notu yazanı ve tarihi döner); BL-797 (409 sonrası sorgu yenilenir, "Reload" eylemi); BL-798 + BL-621 (ham cümle ekrana çıkmaz; `isNoAccess` + ortak hata kartı).
- **Touches:** `apps/api/src/availability/**`, `apps/api/src/app.test.ts` (Availability satırları), `packages/shared/src/<availability>.ts`, `apps/web/src/availability/availability-data.ts`, `WeeklyPreferencesPanel.tsx` (veri ve hata), `apps/web/src/views/AvailabilityPage.tsx` (yalnız sorgu ve sayfa durumu).
- **Bağımlılık:** A1 main'de; EKRAN-03 B main'de (hat sırası).
- **Done when:** rotada `permissions.includes` 0 (grep); üye olmayan 404, yetkisiz 403 + `authz.*` (API vitest, iki uç); `page_size` 30 reddi; 409 sonrası tek tıkla kurtulma (web vitest, önce kırmızı); ham "Idempotency key…" metni ekranda yok (web vitest).
- **Reviewer:** `nf-guvenlik` zorunlu.

### C1 — Liste ve çekmece görünümü (`nf-arayuz`; R2)
- **C görsel QA bulguları (2026-10-06, `d311a2c5`):** `docs/plan/ekranlar/04-availability/C-gorsel.md`; yeni BL-842, BL-843, BL-844, BL-845; ek kanıt BL-600, BL-801, BL-798, BL-677. C1 başlamadan okunur.
- **Ne:** Sistem 1 ortak dili ve sayfalama görünümü (ortak bileşen EKRAN-02 C3); AV11 tablo kendi içinde kayar, başlık yapışkan; BL-661 "1 employee"; K2 "Manager note" adı ve "Last edited by" satırı; BL-800 önizleme sayfası silinir; S1'in seçimi (BL-796); S2'nin seçimi (telefon; BL-599, PHONE A1); C raporunun bulguları (geldiğinde).
- **Touches:** `apps/web/src/views/AvailabilityPage.tsx` (görünüm), `weekly-team.css`, `WeeklyPreferencesForm.tsx` (görünüm, ad), `apps/web/src/employee-hub/EmployeeHubPage.tsx` (yalnız S1), `apps/web/availability-preview.html` ve `WeeklyPreferencesForm.preview.tsx` (silinir).
- **Bağımlılık:** B1 main'de; S1, S2 cevaplandı; EKRAN-02 C3 (sayfalama bileşeni) main'de; EKRAN-03 C main'de (hat sırası).
- **Done when:** önce / sonra ekran görüntüsü 1440 + 390 (owner, müdür) `artifacts/nf-arayuz/EKRAN-04/C1/`; "1 employee"; 120 kişide "1 2 3"; `nf-gorsel-qa` ONAY.
- **Reviewer:** `nf-gorsel-qa`.

### D — e2e (`nf-test`; R2)
- **Ne:** OBS-002 — çalışan haftasını kaydeder → yönetici bildirimi alır → Availability'den çekmeceyi açar, haftayı görür; değişikliksiz ikinci kayıtta bildirim yok; yönetici listede yok.
- **Touches:** `e2e/flows/availability-*.spec.ts`.
- **Bağımlılık:** C1 main'de; `db.lock`; CI boşken (tek ağır iş).
- **Done when:** main CI e2e'de yeşil; `skip` / `fixme` yok.

## Dilim tablosu
| Dilim | Rol | Sınıf | Bağımlılık | Ortak dosya (başka ekranla) | Büyüklük (puan) |
|---|---|---|---|---|---|
| V | `nf-arayuz` | R1 | yok | — | 1 |
| A1 | `nf-db` | R2 | EKRAN-03 A | `ci-green.txt` | 4 |
| B1 | `nf-backend` | R3 | A1, EKRAN-03 B | `apps/web/src/lib/**` (hata kartı) | 3 |
| C1 | `nf-arayuz` | R2 | B1, S1, S2, EKRAN-02 C3 | sayfalama bileşeni, `list-page.css` | 3 |
| D | `nf-test` | R2 | C1 | — | 1 |
| **Toplam** | | **R3** | | | **12** |

## Out of scope
1. **Employee Hub → My availability (ekran 14):** BL-572, BL-571, BL-575 (S1'in sekme kararı hariç).
2. **Onboarding:** BL-568 (653 eski adım), BL-576.
3. **Schedule:** "Previously accepted schedule conflict retained." cümlesi (M9), BL-579, BL-174, `schedule_availability_overrides` adı.
4. **Settings:** BL-262'nin kalan yarısı (`scheduling_settings_shift_types_rls`).
5. **Employees:** çekmecenin sormadan kapanması ile uzun not (P26 / K7) gerilimi — karar sorusu, Employees turunda.
6. **BL-773** (davetli adaya not): kök EKRAN-03 A2'de kapanır; burada yalnız `availability.team_write` hücresi eklenir.

## Done when (ekranın tamamı)
1. V, A1, B1, C1, D'nin Done when'i kanıtıyla Notes / Result'ta (komut + sonuç, sha).
2. E4-01…E4-22 bir dilimde kapandı ya da Out of scope'ta adıyla.
3. Prototip "taşı" (AV3, AV11, PHONE A1) uygulamada.
4. KK-178 (K1–K6), sayfalama ve S1–S3'ün cevapları uygulandı.
5. Tam kapı yeşil (lint, typecheck, test, build, `test:db`, etkilenen e2e); main CI yeşil.
6. 1440 ve 390 ekran görüntüleri `artifacts/nf-gorsel-qa/EKRAN-04/kapanis/`; `nf-gorsel-qa` ONAY.
7. Schedule ızgara okuması ≤ 50 ms korundu (A1 okuma fonksiyonuna dokunuyor; Schedule müsaitlik okuması aynı yardımcıları kullanıyor).

## Risk
- **B1 (R3):** rota kapısı kalkınca karar yalnız çekirdekte; çekirdek bugün zaten soruyor (B raporu), ama kaldırma sırasında "bilgi eksikse izin ver" dalı yazılmamalı.
- **A1 BL-791:** kilit değişikliği yayın ve izin yazımını birlikte etkiler; önce ölçüm, sonra karar.
- **Ortak dosyalar:** sayfalama bileşeni (EKRAN-02 C3), `ci-green.txt`.

## Notes / Result
- 2026-10-06: görev dosyası yazıldı (`nf-planlama`, dal `task/plan-gece`). C (görsel QA) raporu geldiğinde bulguları C1'e eklenir.
