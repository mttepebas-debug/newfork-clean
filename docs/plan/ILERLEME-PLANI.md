# İlerleme planı — çoklu rol oturumu (sürüm 2, 2026-09-27 akşam)

Hazırlayan: `nf-planlama`; şerit sırası koordinatörün ("Hand off raporu", `local_323e063c-efb6-4451-a9c6-39a35ec5e057`) 2026-09-27 akşam planından. Kullanıcı kullanım limitini beklemeden devam dedi.
Ölçüm: `origin/main` `bee7713d`; yerel DB = main (son migration `20260927131000`). Sürüm 1: `b4b6d02` (aynı gün sabah).
Bu dosya bir çalışma planıdır; sıra değişince güncellenir, iş kapandıkça satırı "bitti" olur. Kaynaklar: `ROADMAP.md`, `MVP-PLAN.md`, `tasks/FOUNDATION-B.md`, `BACKLOG.md`.

## 1. Nerede duruyoruz
- **FOUNDATION-B ~%59** (tahmin ağırlıklı; ölçülmüş iş değil). Aşama 1–5 bitti. Takvim dilimi (FB-6.1) **~%92**: `.9` bitti (`0693b51`, `a833cbe`, `bee7713d`); kalan `.0` ekran turu, `.13` görsel, `.14` kapanış + hosted gönderim. FB-6.2 (Çalışanlar) **ready**; FB-6.3 (İzin) S4 hariç cevaplı. Aşama 7 başlamadı.
- **Bugün main'e girenler:** BL-148/166 (Account renkleri), FB-6.1.9 (erişim yok kartı, 13 ekran + Settings 8 sayfa), BL-188 (silinmiş lokasyon şablonda sayılmıyor).
- **Hosted geride:** `20260925173926`'dan bu yana migration'lar yalnız yerelde. `.14` toplu gönderimi kullanıcının son onayıyla (K5).
- **MVP geneli ~%45–50** (2026-09-26 raporu; ölçülmedi).

## 2. Karar bekleyenler
| # | Karar | Durum |
|---|---|---|
| K1–K4 | FB-6.2 S1–S4 | **Cevaplı 09-27** (REUSE "Roller ve kapsam") |
| D1–D5 | Management departmanı / Owner işi | **Cevaplı 09-27** → BL-218 (`tasks/BL-218.md`, ready) |
| K5 | Hosted toplu gönderim | **Cevaplı:** `.9` biter bitmez, son onay kullanıcıdan — `.9` bitti, **şimdi son onay sorulacak** |
| K6 | BL-209 yerel DB kayması | **Cevaplı:** hedefli onarım; tek satırlık komut kullanıcıda (BACKLOG BL-209) |
| K7 | FB-6.1.0 ekran turu + `.13` görsel kararlar | **Açık** — kullanıcının müsait olduğu ilk gün, 30–45 dk |
| K8 | Küçükler: BL-078 kapansın mı, arşivli iş/tip adı kartta, eski oturumların arşivi | **Açık** |
| K9 | Onboarding yedi adım + avatar | **Cevaplı:** lansman için şart, F4'ten önce |
| K10 | FB-6.3 S4 — onaylı iznin iptalini kim onaylar | **Açık (TBD)**; soru `tasks/FB-6.3.md`'de hazır |
| K11 | BL-214 Discard butonu kenarı (ortak buton değeri) ve BL-216 birbirine yakın token'lar | **Açık** — ortak değer kuralı (CLAUDE.md §11.7) |
| K12 | BL-221 — belgesi eksik owner'ın izni de onaysız mı kaydolsun? (bugün incelemeye düşüyor, müdürlere inceleme bildirimi gidiyor) | **Açık** |
| K13 | BL-230 — takas onaylandıktan sonra hafta yayından kaldırılırsa takas korunsun mu? (a) en son yayına bak (Önerilen) / (b) kaldırma sıfırlar, REUSE'a yazılır / (c) beklesin | **Açık** |
| K14 | FB-6.1.9 Settings ürün soruları (S1–S4): (1) varsayılan manager rolünde Settings okuma izinleri yok — REUSE:51 "manager katalogu salt okunur görür" ile çelişiyor; (2) `roles.read` manager tipi role verilebiliyor — REUSE Roles'u manager'a kapatıyor; (3) Acknowledgements manager kataloğunun parçası mı; (4) Important dates okuma kapsamı ve başka lokasyon adlarının görünmesi | **Açık** — seçenekli metni koordinatörde; FB-6.8'i etkiler |
| K15 | Faturalama (BL-059) S1–S7: fiyat birimi, giriş fiyatı, deneme sonu, plan sayısı, yıllık ödeme, iptal/iade, satış vergisi (+ şirketin eyaleti) | **Açık** — F4; kod FOUNDATION-B sonrası |
| K16 | FB-6.1b S1–S3 — "yayınlanmışları soluk göster" anahtarı: hangi vardiyalar görünür, anahtar hangi düzenlemelerde var, açık mı kapalı mı başlar | **Açık** — seçenekli metin `tasks/FB-6.1b.md`; T1/T2 teknik teyit koordinatörde |

## 3. Sıradaki en önemli iş (gerekçesiyle)
1. **FB-6.1.14 hosted toplu gönderim (K5 son onayı).** Gerekçe: canlı ile main arasındaki fark en büyük risk; `.9` bittiği için engel yalnız kullanıcının onayı.
2. **BL-198** (onaylı takas eski taslakla geri alınıyor; high/risky). DB + web/API + metin + e2e aynı birleştirmede. Gerekçe: sessiz veri kaybı.
3. **BL-218 → FB-6.2.** Gerekçe: programın kritik yolu; BL-218 `.1`–`.3` FB-6.2 `.4`'ün önkoşulu.
4. **Settings ikiz okuma ölçümü (BL-222).** Gerekçe: FB-6.1.9 okumayı API'ye taşıdı ama tarayıcı izni açık; ölçülmeden izin kaldırılmaz.

## 4. Şeritler (paralel rol oturumları)
Kurallar: aynı dosyaya iki rol aynı anda konmaz (CLAUDE.md §4); aynı anda en çok iki ağır iş; migration ortak yerel DB'ye yalnız birleştirme penceresinde (`scripts/lock.mjs`); her kod işi `nf-guvenlik`, ekranı değişen `nf-gorsel-qa`.

| Şerit | Rol | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|
| A — DB | `nf-db` | **BL-183 + BL-197** main'e (koordinatör birleştirir, bu akşam) | **BL-198 DB** — B, C, D parçalarıyla aynı birleştirmede main'e | ~~Settings ikiz SELECT ölçümü~~ **bitti 09-27** → BL-222 (6 tabloyu kapatan migration), BL-231, BL-232 (FB-6.8) | **FB-6.2 `.1`** (BL-218 ready ✓) → BL-218 `.1`–`.3` |
| B — API/web veri | `nf-backend` | **BL-198 web/API** + BL-197 `skipped` tipi | **BL-211** (`GET /schedule/shifts` 500) | **FB-6.2** `permissions.includes` → `can()` (Done when 6) | BL-213 (Shift changes `ExchangeError`) |
| C — Arayüz | `nf-arayuz` | **BL-192 + BL-205** DEV varyantları (telefonda yönetim gezinmesi, Together başlıkları) | **BL-198 / BL-197 metinleri** | **BL-215** (sihirbazda ham hex) | BL-218 `.4`–`.6` (A/B'den sonra) |
| D — Test | `nf-test` | **BL-210** (`shift-hub-swap` tekrar koşu) | **BL-212** (rozet ölçüm testi) | **BL-217** (iki test `tests.world()`'e; BL-209 onarımından sonra) | **BL-198 e2e** |
| E — Plan | `nf-planlama` | ~~Kayıt turu (BL-218 dosyası, FB-6.2 ready, FB-6.1 kaydı, backlog, bu plan)~~ **bitti 09-27** | **FB-6.3 S4 sorusu** hazır tut (K10) | ~~BL-059 Stripe araştırması~~ **bitti 09-27** → `tasks/BL-059.md` (S1–S7 kullanıcıda, K15) | ~~FB-6.1b görev dosyası~~ **bitti 09-27** (`tasks/FB-6.1b.md`; `.1` BL-159 A şeridine hazır, B4 K16'yı bekler) |
| F — İnceleme | `nf-guvenlik`, `nf-gorsel-qa` | çağrıldıkça | | | |
| Koordinatör | — | Birleştirme pencereleri (A1, sonra BL-198 paketi) | **FB-6.1.14 hosted gönderim** (K5 son onayıyla) | **Ekran turu K7** (`.0` + `.13`) | Temizlik (§6) |

Eşzamanlılık: B1, C1, D1 ve E aynı anda koşabilir (dosyaları ayrık). BL-198'in dört parçası (A2, B1, C2, D4) tek birleştirme penceresinde main'e girer (sözleşme değişiyor). A4 (FB-6.2 `.1`) çekirdeğe dokunur; A2 (BL-198) çekirdeğe dokunuyorsa A4 ondan sonra (Ç4).

## 5. Çakışmalar ve sıralama kuralları
- **Ç1 — FB-6.2 Employees ekranı.** `EmployeeDrawer`/`EmployeesPage`'teki `permissions.includes` → `can()` FB-6.2'nin Done when 6'sı (B3); Employees'in tarayıcıdan doğrudan okuması (`employee-data.ts:207-225`) BL-222 ile FB-6.2'de.
- **Ç2 — BL-198 ile BL-206.** BL-206 (ölü kod silme) BL-198'den ve hosted gönderimden sonra.
- **Ç3 — BL-187 FB-6.2 `.6`'da** (koordinatör kararı 09-27).
- **Ç4 — Çekirdek sahipliği.** `app_private.authz_check`'e dokunan işler (FB-6.2 `.1`–`.4`, gerekiyorsa BL-198) aynı anda yazılmaz; A şeridinde ardışık, her biri kendi birleştirme penceresinde. BL-218 çekirdeğe dokunmaz; FB-6.2 `.4`'ten önce `.1`–`.3`'ü main'de olur.
- **Ç5 — Hosted gönderim sıra şartı.** Onaylı izin CHECK'i ve BL-186 migration'ı web/API yayınıyla aynı anda; sonra security advisors. Arada main'e giren migration'lar aynı pakete.
- **Ç6 — Ortak yerel DB.** BL-209 onarılana kadar yerelde `shift_exchanges_v1`, `time_off_published_assignment_disposition` (ve ayrılmamış `weekly_exchange_changed_terms`, BL-227) kırmızısı bilinen yanlış alarm.
- **Ç8 — `nf-db` sırası, BL-218'den sonra (koordinatör, 2026-09-28).** (1) FB-6.1b `.1` (BL-159) BL-218 `.2`'den sonra: ikisi de `apply_schedule_template_service`'e dokunuyor (BL-218 T2). (2) BL-234 (yayından kaldırılan hafta yeniden yayınlanamıyor) ve BL-230 (yayından kaldırmada takas) birlikte, BL-218'den sonra: aynı yüzey. BL-230'un K13 cevabı gelmezse BL-234 tek başına gider.
- **Ç7 — Bağlam.** Her rol oturumu iş sınırında bağlam doluluğunu söyler; yarıyı geçince devir (CLAUDE.md §11.10, §12 yenileme).

## 6. Temizlik (koordinatör, iş aralarında)
- Eski dallar (`git branch --no-merged origin/main`): her biri `git cherry`/içerik farkıyla doğrulanıp silinir.
- `.claude/worktrees/` altındaki bitmiş worktree'ler.

## 7. MVP listesi (kalan, faz sırasıyla)
| Faz | Kalan | Durum | Engel |
|---|---|---|---|
| F0 temel | OPS-010 hosted smoke; SEC-001 (Supabase'ten cevap) | bekliyor | kullanıcı / Supabase |
| FOUNDATION-B | FB-6.1 `.0`/`.13`/`.14`; FB-6.2 … FB-6.8; FB-6.1b; BL-218; Aşama 7 | ~%59 | K5, K7 |
| FJ katılım | JOIN-010, JOIN-007 kalanı; akış 2 "Davet" e2e (FB-6.2'de) | ~%80 | — |
| F1 çekirdek akışlar | UI-DOC-001, BL-038, REQ-AUDIT, BL-048, BL-055; açık high'lar BL-198, BL-182, BL-127, BL-187 (FB-6.2) | ~%55 | FOUNDATION-B dilimleri |
| F2 günlük operasyon | ANN-001; Line Up (ayrı proje, MVP'de mi — sorulmadı) | ~%20 | ürün kararı |
| F3 bildirimler | Resend teslimatı, bildirim sistemi yeniden tasarımı, BL-099, BL-101 | ~%20 | FB-6.7 |
| F4 ticari | BL-059 Stripe, BL-034 landing, BL-007/008 (şart) | ~%5 | FOUNDATION-B bitişi (araştırma şimdi) |
| F5 cila | BL-192, BL-205, BL-193, THEME-003, BL-214/216 | ~%15 | K11 |
| F6 lansman | BL-058 beş tenant e2e, REL-001, REL-002 | başlamadı | hepsi |

## 8. Bu akşamın sırası (koordinatöre)
1. A1: BL-183 + BL-197 birleştirme penceresi.
2. Kullanıcıya K5 son onayı (hosted toplu gönderim) + K7 (ekran turu günü) + K10/K11 (tek turda).
3. B1 / C1 / D1 görev mesajları (BL-198 web/API, BL-192+205 varyantları, BL-210); A2 BL-198 DB.
4. BL-198 dört parçası hazır olunca tek pencere.
5. A3 BL-222 ölçümü → A4 FB-6.2 `.1`.
