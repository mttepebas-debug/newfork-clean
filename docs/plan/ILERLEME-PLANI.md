# İlerleme planı — çoklu rol oturumu (2026-09-27)

Hazırlayan: `nf-planlama`, kullanıcının isteğiyle ("aktif işler, karar bekleyenler, sıradaki en önemli iş, MVP listesi, çakışmalar; çoklu rol oturumuyla ilerleme başlasın"). Yürüten: koordinatör ("Hand off raporu", `local_323e063c-efb6-4451-a9c6-39a35ec5e057`).
Ölçüm: `origin/main` `6fb7743`; kilitler boş (`node scripts/lock.mjs status`); yerel DB = main (son migration `20260926230000`).
Bu dosya bir çalışma planıdır; sıra değişince güncellenir, iş kapandıkça satırı "bitti" olur. Kaynaklar: `ROADMAP.md`, `MVP-PLAN.md`, `tasks/FOUNDATION-B.md`, `HANDOFF.md`, `BACKLOG.md`.

## 1. Nerede duruyoruz
- **FOUNDATION-B ~%58** (tahmin ağırlıklı; ölçülmüş iş değil). Aşama 1–5 bitti. Aşama 6: Takvim dilimi (FB-6.1) **~%85** — `.1 .2a .2 .3a .3b .4 .5 .6 .7 .8 .10 .11 .12` main'de; kalan `.0` ekran turu, `.9` diğer ekranlar, `.13` görsel, `.14` kapanış + hosted gönderim. Diğer yedi dilim başlamadı; Aşama 7 başlamadı.
- **MVP geneli ~%45–50** (2026-09-26 raporu; değişmedi).
- **Hosted geride:** `20260925173926`'dan bu yana bütün migration'lar yalnız yerelde (FB-6.1.14'ün toplu gönderimi). Canlıdaki uygulama ile main arasındaki fark her gün büyüyor — en büyük tek risk.
- **Devam eden kod işi yok.** Açık dallar birleşmiş ya da terk edilmiş (temizlik bekliyor, bölüm 6).

## 2. Karar bekleyenler (kullanıcıya, tek turda; önerilen ilk)
| # | Karar | Önerilen | Neyi açar |
|---|---|---|---|
| K1 | FB-6.2 S1 — kişinin **tek** lokasyonundan çıkarılması | **Cevap 09-27: (a)** + lokasyonsuz kaydetme yasağı şartı | FB-6.2 (Çalışanlar) — kritik yol |
| K2 | FB-6.2 S2 — "yalnız yönetir" müdür nerede görünür | **Cevap 09-27: (a)** | FB-6.2 |
| K3 | FB-6.2 S3 — rolü düşenin "yalnız yönetir" lokasyonları | **Cevap 09-27: (a)** | FB-6.2 |
| K4 | FB-6.2 S4 — owner kaydında birincil lokasyon/iş | **Cevap 09-27:** owner her yerde çalışabilir, birincil zorunlu değil, exclude, A–Z; "By role" açık (Management/Owner araştırması) | FB-6.2 |
| K5 | Hosted toplu gönderim zamanı (FB-6.1.14) ve Auth ayarları (OTP 3600, APP_URL, gönderen adres, parola ≥8) | **Cevap 09-27:** `.9` biter bitmez, göndermeden önce kullanıcıdan son onay; Auth ayarlarını kullanıcı yapar | Canlı = main |
| K6 | BL-209 yerel DB kayması: hedefli onarım mı `supabase db reset` mi | **Cevap 09-27:** hedefli onarım (`nf-test` teşhis, `nf-db` uygular) | Birleştirmelerde yanlış alarm biter |
| K7 | FB-6.1.0 ekran turu + `.13` görsel kararlar: ne zaman | Kullanıcı müsait olduğu ilk gün, 30–45 dk | FB-6.1 kapanışı |
| K8 | Küçükler: BL-078 kapansın mı (evet), arşivli iş/tip adı kartta gösterilsin mi, eski oturumların arşivi | — | kayıt temizliği |
| K9 | Onboarding yedi adım + avatar (BL-007/008) lansman için şart mı | **Cevap 09-27:** şart, F4'ten önce (MVP-PLAN) | MVP kapsamı |

## 3. Sıradaki en önemli iş (gerekçesiyle)
1. **FB-6.1 kapanışı (`.9` → `.14` hosted gönderim).** Gerekçe: canlı ile main arasındaki fark en büyük risk; pilot kapanmadan diğer dilimlerin tahmini yenilenemez (FOUNDATION-B kuralı).
2. **BL-198 onaylı takas eski taslakla geri alınıyor** (high/risky, görev dosyası hazır, BL-186 main'de olduğu için başlayabilir). Gerekçe: sessiz veri kaybı; kullanıcı fark etmez.
3. **K1–K4 cevapları → FB-6.2.** Gerekçe: programın kritik yolu; cevapsız her gün FB-6.3/6.4'ü de geciktirir.
4. **BL-188 + BL-187** (silinmiş lokasyon kuralları; owner kendi lokasyonunu silemiyor). Gerekçe: iki high, Settings → Locations ve Templates'te görünen hatalar.

## 4. Şeritler (paralel rol oturumları)
Kurallar: aynı dosyaya iki rol aynı anda konmaz (CLAUDE.md §4); aynı anda en çok iki ağır iş (tam test, e2e, build); migration ortak yerel DB'ye yalnız birleştirme penceresinde, `main.lock` + `db.lock` ile (`scripts/lock.mjs`); her kod işi `nf-guvenlik`, ekranı değişen `nf-gorsel-qa`.

| Şerit | Rol oturumu | 1. iş (şimdi) | 2. iş | 3. iş | Not |
|---|---|---|---|---|---|
| A — DB | `nf-db` | **BL-198** (`tasks/BL-198.md`, ready) | **BL-188** (+ BL-187'nin kapsam dışı kalan kısmı, bkz. Ç3) | **BL-183** DB yarısı (`tasks/BL-183.md`, kararlar kapandı → ready) → BL-197 | Tek `nf-db` oturumu, ardışık; her biri ayrı branch ve onay |
| B — API/web veri | `nf-backend` | ~~FB-6.1.9 API ekranları~~ **bitti 09-27** (`0693b51`); **devamı: 8 Settings sayfası için API okuma ucu** (önce `nf-db` eylem + matris) (`NoAccessState` + `noAccessHomePath`; liste HANDOFF §4.5) | **BL-211** (`GET /schedule/shifts` 500, requestId `req-am`) | BL-198'in web/API kısmı (nf-db sözleşmesinden sonra) | `.9`'da Employees ekranı yalnız `NoAccessState`; `permissions.includes` → `can()` FB-6.2'nin (Ç1) |
| C — Arayüz | `nf-arayuz` | ~~BL-148 + BL-166~~ **bitti 09-27** (`f5fb2f1`) | **BL-192** telefonda yönetim gezinmesi — DEV'de 2–3 varyant, kullanıcı seçer; **BL-205** ile birlikte | BL-183 metni (DB yarısından sonra) | BL-192 high; varyantlar hazırlanır, seçim K7 turunda |
| D — Test | `nf-test` | ~~BL-209 teşhisi~~ **bitti 09-27**: kök neden bulundu, onarım komutu kullanıcıda; sonra BL-217 | **BL-210** (`shift-hub-swap` tekrar koşu) + **BL-212** (rozet ölçüm testi) | Birleştirme pencerelerinde tam `test:db` + e2e | Ağır işi koordinatörün pencereleriyle sıralı |
| E — Plan | `nf-planlama` | **FB-6.3 İzin** görev dosyası (FB-6.2 cevap beklerken ön ölçüm) | **BL-059 Stripe** araştırma + görev dosyası (ABD fiyat/trial; kod yok) | FB-6.1b (B2/B4) görev dosyası | Yalnız `docs/plan/**` |
| F — İnceleme | `nf-guvenlik`, `nf-gorsel-qa` | çağrıldıkça | | | Görsel QA'da müdür/çalışan rolü için test dünyası hesapları (FB-6.1 Notes'taki sınır) |
| Koordinatör | — | K1–K9'u tek turda kullanıcıya sor | Birleştirme pencereleri; temizlik (bölüm 6) | FB-6.1.14 hosted gönderim (K5 onayıyla) | |

Eşzamanlılık: A, B, C, E aynı anda koşabilir (dosyaları ayrık). D'nin teşhisi salt okunur. Ağır işler (e2e, `test:db`) koordinatörün pencerelerinde, aynı anda en çok iki.

## 5. Çakışmalar ve sıralama kuralları
- **Ç1 — `.9` ile FB-6.2 Employees ekranı.** `.9` Employees'e yalnız `NoAccessState`/`noAccessHomePath` ekler; `EmployeeDrawer`/`EmployeesPage`'teki 12 `permissions.includes` → `can()` FB-6.2'nin Done when 6'sı. `.9` o satırlara dokunmaz.
- **Ç2 — BL-198 ile BL-206.** İkisi de yayın hazırlığına ve `PublishScheduleDialog`'a dokunuyor; BL-206 (ölü kod silme) **BL-198'den sonra** ve hosted gönderimden sonra ("yayında doğrulanmadan silinmez").
- **Ç3 — BL-187 ile FB-6.2.** Lokasyon silme `can_manage_employee_record` soruyor (`catalog_entity_deletion.sql:88-98`); FB-6.2 P1 bu fonksiyonu (`delete_catalog_entity_service`) çekirdeğe taşıyor. **Öneri:** BL-187'yi FB-6.2'nin `.6`'sına katmak (aynı fonksiyon, tek taşıma); BL-188 bağımsız, şimdi yapılır. Karar koordinatörün.
- **Ç4 — FB-6.2 ↔ `authz_check`.** Çekirdeğe dokunan iki iş aynı anda yazılmaz (BL-139 dersi). A şeridinde BL-198/188 çekirdeğe dokunursa FB-6.2 `.1` onlardan sonra.
- **Ç5 — Hosted gönderim sıra şartı.** Onaylı izin CHECK'i ve BL-186 migration'ı web/API yayınıyla **aynı anda**; sonra security advisors. Arada başka migration main'e girerse o da aynı pakete girer.
- **Ç6 — Ortak yerel DB.** BL-209 çözülene kadar yerelde `shift_exchanges_v1` ve `time_off_published_assignment_disposition` kırmızısı "bilinen yanlış alarm"; birleştirme penceresinde bu ikisi hariç 0 kırmızı aranır.
- **Ç7 — Bağlam.** Her rol oturumu iş sınırında bağlam doluluğunu söyler; yarıyı geçince devir (CLAUDE.md §11.10).

## 6. Temizlik (koordinatör, iş aralarında)
- `git branch --no-merged origin/main` listesinde ~20 eski dal (bl186-*, ghost-*, bl180, bl208, fb61-8-*, plan-*, no-access-wire, …): çoğunun içeriği başka sha ile main'de; her biri `git cherry`/içerik farkıyla doğrulanıp silinir. `ghost-color-mockups` main'e girmeyecek.
- `.claude/worktrees/` altında ~33 worktree (HANDOFF §8 listesi).
- 5616/5617'de sahibi bilinmeyen süreç (HANDOFF §2).

## 7. MVP listesi (kalan, faz sırasıyla)
| Faz | Kalan | Durum | Engel |
|---|---|---|---|
| F0 temel | OPS-010 hosted smoke; SEC-001 (Supabase'ten cevap) | bekliyor | kullanıcı / Supabase |
| FOUNDATION-B | FB-6.1 kapanışı; FB-6.2 … FB-6.8; FB-6.1b; Aşama 7 (tek migration tabanı + hosted yeniden kurulum) | ~%58 | K1–K5 |
| FJ katılım | JOIN-010 (taslak), JOIN-007 kalanı; akış 2 "Davet" e2e (FB-6.2'de) | ~%80 | — |
| F1 çekirdek akışlar | UI-DOC-001 (bloklu), BL-038 şablon UAT, REQ-AUDIT, BL-048, BL-055; açık high'lar: BL-198, BL-188, BL-187, BL-182, BL-127 | ~%55 | FOUNDATION-B dilimleri |
| F2 günlük operasyon | ANN-001 duyuru hedefleme; Line Up (ayrı proje, MVP'de mi — sorulmadı) | ~%20 | ürün kararı |
| F3 bildirimler | Resend teslimatı (BL-027 anahtar), bildirim sistemi yeniden tasarımı (ayrı proje), BL-099, BL-101 | ~%20 | FB-6.7 |
| F4 ticari | BL-059 Stripe, BL-034 landing, K9 | ~%5 | FOUNDATION-B bitişi (araştırma şimdi) |
| F5 cila | BL-192 mobil gezinme, BL-205, BL-193, THEME-003, admin polish | ~%15 | — |
| F6 lansman | BL-058 beş tenant e2e (hosted), REL-001 production, REL-002 soft launch | başlamadı | hepsi |

## 8. Başlangıç sırası (koordinatöre)
1. Kullanıcıya K1–K9'u tek turda sor (FB-6.2 soruları gerçek ekranla ve örnekle; `tasks/FB-6.2.md` "Açık sorular").
2. Aynı anda şeritlerin 1. işlerini rol oturumlarına ver: A BL-198, B FB-6.1.9, C BL-148+166, D BL-209 teşhisi, E FB-6.3 ön ölçümü. Her görev mesajı: hedef, kapsam, Done when, dosyalar, Skills (CLAUDE.md §3).
3. İlk birleştirme penceresi: `.9` + BL-148/166 (migration yok, hafif) → sonra BL-198 (migration'lı).
4. K5 onayıyla FB-6.1.14 hosted toplu gönderim; ardından BL-206.
5. K1–K4 gelince FB-6.2 `.0`.
