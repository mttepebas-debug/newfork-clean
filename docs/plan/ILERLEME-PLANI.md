# İlerleme planı — hesaplı (sürüm 5, 2026-09-28)

Hazırlayan: `nf-planlama` (`local_c67b8d60-…`). Koordinatör: "Koordinatör — devir 2026-09-28", `local_41428574-b1a9-44cb-9a7c-cd34afc9456a`.
Ölçüm: `origin/main` `1d349d2a`, 2026-09-28; SEC-003 commit'leri `34fc2075`, `3eeb4c11` (`nf-db`), `6887fbbc` (`nf-backend`), `d0751603`, `0d03389e`, `74e2d363` (`nf-test`) — hepsi `git cat-file` ile doğrulandı; durumlar koordinatörün 2026-09-28 güncellemesiyle. Hesap betiği: satırlar, bağımlılıklar ve puanlar bu dosyadaki tablolardır; sayıları elle değil betikle ürettim, tablo değişince aynı yolla yeniden hesaplanır.

**Güncelleme kuralı (3 satır):**
1. Tablo her main birleşmesinde, her karar cevabında ve işi durduran her bulguda yeniden hesaplanır (durum, yüzde, sıra, karar ağırlığı).
2. Her yeniden hesapta koordinatöre 3 satır gider: ne değişti · hedef yüzdeleri · sıradaki iş ve neden (hesabın üç sayısıyla).
3. Tek hat (CLAUDE.md §11.4/§11.6, `1d349d2a`): aktif hedef bitene kadar yalnız o; sıradaki iş bu tablodan gelir. Hedef dışı iş yalnız kullanıcı kararıyla araya girer (§7).

## Büyüklük ölçütü (puan)
| Puan | Ölçüt (en yüksek tutan satır geçerli) | Kabaca süre (tahmin) |
|---|---|---|
| 1 | Tek katman, 1–2 dosya; test yok ya da tek test; kayıt, ölçüm, kapanış | ≤ ½ gün |
| 2 | Tek katman, ≤ 5 dosya; birim testleri | ~1 gün |
| 3 | İki katman (ör. DB + pgTAP, API + web) ya da ≤ 10 dosya; ya da tek e2e senaryosu | ~2 gün |
| 5 | Üç katman ya da sözleşme değişikliği (shared tip + API + web) ya da migration + e2e | 3–4 gün |
| 8 | Dört katman (DB + API + web + ekran) ya da birden çok migration + e2e; daha büyüğü bölünür | ~1 hafta |
Katman: DB (migration/pgTAP) · API · web veri katmanı · ekran (görünüm/metin) · e2e. Görev dosyası olmayan dilimler için puan, FOUNDATION-B dilim tablosundaki kişi-hafta orta noktası × 8'dir ve **tahmin** diye işaretlidir; görev dosyası yazılınca adımlara bölünür.
Durum: bitti (main'de) · incelemede (commit var, ONAY ya da birleştirme bekliyor) · sürüyor · hazır (önünde bekleyen satır ve karar yok) · bekliyor.

## 1. Hedefler ve ilerleme (biten puan ÷ toplam puan)
| Hedef | Biten / toplam | Yüzde | Not |
|---|---|---|---|
| **SEC-003 hesap güvenliği paketi** (aktif) | 1 / 26 | **%3,8** (2026-09-28, `1d349d2a`) | Main'e paket olarak girer; dallarda ayrıca incelemede 8 (S.1a, S.1b, S.C), sürüyor 10 puan (S.A, S.B). |
| **FOUNDATION-B — Aşama 6–7** (sonraki) | 77 / 230 | **%33,5** (2026-09-28, `1d349d2a`) | Bitenlerin 61 puanı FB-6.1'in 14 adımının geriye dönük puanı (tahmin). Açık dilimlerden FB-6.4–6.8 ve Aşama 7 görev dosyasız (tahmin, 44 puan). |
| FOUNDATION-B — program geneli (bilgi) | 155 / 308 | %50,3 (tahmin) | Aşama 1–5 bitti; plandaki süre orta noktaları × 8 = 78 puan sayıldı. Eski "~%58" formülünün yerine geçer; ikisi farklı ölçü, karşılaştırılmaz. |

## 2. İş tablosu — SEC-003 (aktif hedef)
Kaynak: `tasks/SEC-003.md`, koordinatör girdisi 2026-09-28, dallar yukarıda.
| ID | Ne (kişi için) | Bağlı olduğu | Karar | Puan | Durum | Rol | Ana dosyalar |
|---|---|---|---|---|---|---|---|
| S.0 | Görev dosyası ve kararlar | — | — | 1 | bitti | `nf-planlama` | `tasks/SEC-003.md` |
| S.1a | Eski parolasız hesap silme yolu veritabanından kalkar; davet kabulü onaylı e-posta ister | — | — | 3 | incelemede (`34fc2075`, `nf-guvenlik` ONAY) | `nf-db` | `supabase/migrations`, `supabase/tests` |
| S.1b | Onaysız hesap davet listesini görmez, reddedemez (`3eeb4c11`); yerel `enable_confirmations`; D-1 | S.1a | — | 2 | incelemede (`nf-guvenlik` ONAY @`3eeb4c11`: O-2, D-1, config; koşul: `config.toml` yalnız S.C ve S.D ile aynı birleştirmede main'e) | `nf-db` | `supabase/migrations`, `supabase/config.toml` |
| S.A | Account → Workspaces'te kapatma ve sahiplik devri parolayı sunucuda sorar (#3; planlı kapatma "Close at end of period" penceresine var olan parola alanı gelir, iki ölü `reauthentication_required` dalı silinir; ortak yardımcı `apps/api/src/auth/verify-password.ts`, hata anahtarı `session.password_incorrect` S.B ile ortak); eski silme rotaları kalkar (#4, `6887fbbc`) | — | — | 5 | sürüyor (#4 commit'li) | `nf-backend` | `apps/api/src/account/workspace-account-*`, `apps/api/src/auth/verify-password.ts`, `packages/shared`, `apps/web/src/lib/supabase.ts`, `WorkspacesPage.tsx` |
| S.B | Davet, silinen hesabın kilidini açmaz (#1); Account → Security'de parola değişimi mevcut parolayı ister (#2; hata anahtarı `session.password_incorrect`, S.A ile ortak); O-1 ve testi; davet kabulünün API tarafı ve görünen ad (#9) | S.1a | — | 5 | sürüyor (işçi oturumu "SEC-003-B davet kilidi ve parola kontrolü") | işçi oturumu (`nf-backend` kuralları) | `apps/api/src/employees/invitation-service.ts`, `employee-create-service.ts`, `apps/api/src/account/account-security-*`, `apps/api/src/app.ts` |
| S.C | Uçtan uca: parola değişimi ve devir parolayla; yeni owner yerel posta kutusundan e-postasını onaylar | — | — | 3 | incelemede (`d0751603`, `0d03389e`, `74e2d363` `ci.yml` tek satır; iki kırmızı doğru nedenle, S.A/S.B sonrası yeşil koşu bekliyor) | `nf-test` | `e2e/**`, `.github/workflows/ci.yml` |
| S.D | Ekran metinleri: "e-postanı doğrula" ve "parola yanlış" | S.A, S.B | — | 2 | bekliyor | `nf-arayuz` | giriş/kayıt ekranı, Account → Security |
| S.E | Birleştirme: tam kapı, `nf-guvenlik`, `nf-gorsel-qa` (Account → Workspaces'te ekran değişti), ultrareview önerisi, yerel auth yeniden başlatma | S.1b, S.A, S.B, S.C, S.D | — | 3 | bekliyor | koordinatör | — |
| S.F | Hosted: BL-265 + SEC-003 migration'ı gönderimi ("Confirm email" kullanıcı tarafından açıldı, K22 kapandı). **Yayın öncesi şart:** hosted e-posta teslimatı (SMTP, saatlik sınır) ölçülür ve S.D'nin "e-postanı doğrula" ekranı main'de (web/API yayınından önce) | S.E | — | 2 | bekliyor | koordinatör + kullanıcı (gönderim onayı) | hosted |

## 3. İş tablosu — FOUNDATION-B Aşama 6–7 (aktif hedef bitince)
Kaynak: `tasks/FOUNDATION-B.md` dilim tablosu, `FB-6.1.md`, `FB-6.1b.md`, `BL-218.md`, `FB-6.2.md`, `FB-6.3.md`; durumlar `origin/main` `1d349d2a`.
| ID | Ne (kişi için) | Bağlı olduğu | Karar | Puan | Durum | Rol | Ana dosyalar |
|---|---|---|---|---|---|---|---|
| F.can | Web'de tek yetki yardımcısı `can()` (FB-6.0-can) | — | — | 5 (tahmin) | bitti | `nf-backend` | — |
| F.61 | FB-6.1 Schedule'ın bitmiş 14 adımı (`.1`–`.12`) | — | — | 61 (geriye dönük tahmin) | bitti | çok rol | — |
| FB-6.1.0 | Schedule ekran turu: kullanıcı ekranları gezer, sorunları söyler | — | K7 | 2 | bekliyor | koordinatör + kullanıcı | — |
| FB-6.1.13 | Schedule'da seçilen görsel varyantlar uygulanır | FB-6.1.0 | — | 3 | bekliyor | `nf-arayuz` | `apps/web/src/schedule/**` görünüm |
| FB-6.1.14 | FB-6.1 kapanışı | FB-6.1.13 | — | 2 | bekliyor | koordinatör | `tasks/FB-6.1.md` |
| BL-218.1 | Management/Owner kırmızı testleri | — | — | 3 | bitti | `nf-db` | — |
| BL-218.2 | Management/Owner veritabanı kuralları | — | — | 8 | bitti | `nf-db` | — |
| BL-218.3 | Owner ve Management'ı Takvim ve Employees çekmecesine taşıyan veri sözleşmesi (tip, API, web veri) | — | — | 5 | hazır | `nf-backend` | `packages/shared`, `apps/api/src/schedule`, `apps/web/src/schedule/*-data`, `apps/web/src/employees/*-data` |
| BL-218.4 | Kurulum sihirbazında "en az 1" metni; Settings → Jobs'ta kilitli Owner satırı | BL-218.3 | — | 3 | bekliyor | `nf-arayuz` | `OwnerOnboardingPage.tsx`, Settings → Jobs |
| BL-218.5a | Employees çekmecesinin iş listesi için departman ve Owner bilgisi (okuma) | BL-218.3 | — | 3 | bekliyor | `nf-db` + `nf-backend` | `read_employee_references_service`, employees data |
| BL-218.5b | Çekmecede iş listesi departmana göre gruplu, Owner kilitli (DEV varyantları) | BL-218.5a | — | 3 | bekliyor | `nf-arayuz` | `EmployeeDrawer.tsx` |
| BL-218.6 | Takvim'de "By department", Management grubu, iki satır, tek sayım | BL-218.3 | — | 5 | bekliyor | `nf-arayuz` (+ `nf-backend`) | `apps/web/src/schedule/**` |
| BL-218.7 | e2e: kurulum → çekmece → By department | BL-218.4, .5b, .6 | — | 3 | bekliyor | `nf-test` | `e2e/flows/**` |
| FB-6.1b.1 | Açık düzenleme tutmadığı lokasyona vardiya ekleyemez (BL-159) | — | — | 3 | hazır | `nf-db` | `supabase/migrations` (`apply_schedule_template_service`) |
| FB-6.1b.2 | Boş yeni taslakta "yayınlanmışları soluk göster" anahtarı (DEV varyantları) | — | — | 3 | hazır | `nf-arayuz` | `SchedulePage.tsx`, schedule CSS |
| FB-6.1b.3 | e2e iki senaryo | FB-6.1b.1, .2 | — | 3 | bekliyor | `nf-test` | `e2e/flows/**` |
| FB-6.2.0 | Çalışanlar dilimi taze ölçüm (FB-6.1 işlevsel kısmı ve BL-139 main'de) | — | — | 1 | hazır | `nf-planlama` (+ `nf-test` koşu) | `tasks/FB-6.2.md` |
| FB-6.2.1 | Yetki matrisi: ikinci admin, "yalnız yönetir", lokasyondan çıkarma | FB-6.2.0 | — | 3 | bekliyor | `nf-db` | `supabase/tests/authorization_matrix.test.sql` |
| FB-6.2.2 | Veri modeli: "yalnız yönetir", "kendi lokasyonundan çıkar" komutu | FB-6.2.1 | — | 5 | bekliyor | `nf-db` | `supabase/migrations` |
| FB-6.2.3 | Çalışan okuma ve listesi çekirdeğe | FB-6.2.2 | — | 3 | bekliyor | `nf-db` | `supabase/migrations` |
| FB-6.2.4 | Çalışan yazmaları çekirdeğe (kaydet, çıkar, arşiv, erişim, rol) | FB-6.2.3, BL-218.3 | — | 5 | bekliyor | `nf-db` | `supabase/migrations` |
| FB-6.2.5 | Davet çekirdeğe | FB-6.2.4 | — | 3 | bekliyor | `nf-db` (+ API imza) | `supabase/migrations`, `invitation-service.ts` |
| FB-6.2.6 | İş katalogu ve pano çağıranları çekirdeğe; BL-187 | FB-6.2.5 | — | 3 | bekliyor | `nf-db` | `supabase/migrations` |
| FB-6.2.7 | API ve web veri: lokasyondan çıkarma ucu, `can()` geçişi, "Çalışan görünümüne geç" rotası | FB-6.2.6 | — | 5 | bekliyor | `nf-backend` | `employee-directory-routes.ts`, `App.tsx`, employees data |
| FB-6.2.8 | Employees ekranı: "Kendi lokasyonundan çıkar", "Yalnız yönetir", etiketler (DEV varyantları) | FB-6.2.7 | — | 5 | bekliyor | `nf-arayuz` | `EmployeeDrawer.tsx`, `EmployeesPage.tsx` |
| FB-6.2.9 | Kırmızı dosyalar yeşile (`roles_permissions_rls`) | FB-6.2.6 | — | 3 | bekliyor | `nf-test` | `supabase/tests/**`, `ci-green.txt` |
| FB-6.2.10 | e2e: davet ve kapsam akışları | FB-6.2.7 | — | 3 | bekliyor | `nf-test` | `e2e/flows/invite.spec.ts` |
| FB-6.2.11 | FB-6.2 kapanışı | FB-6.2.8, .9, .10 | — | 1 | bekliyor | koordinatör | `tasks/FB-6.2.md` |
| FB-6.3.0 | İzin dilimi taze ölçüm | FB-6.2.11 | — | 1 | bekliyor | `nf-planlama` | `tasks/FB-6.3.md` |
| FB-6.3.1 | Yetki matrisi: izin oylaması ve iptal | FB-6.3.0 | K10 | 3 | bekliyor | `nf-db` | `supabase/tests` |
| FB-6.3.2 | İzin talebinden lokasyon kalkar (sözleşme) | FB-6.3.1 | — | 5 | bekliyor | `nf-db` | `supabase/migrations` |
| FB-6.3.3 | Oylama motoru | FB-6.3.2 | — | 5 | bekliyor | `nf-db` | `supabase/migrations`, `time_off_voting.test.sql` |
| FB-6.3.4 | Kalan izin yardımcıları ve bildirim alıcıları çekirdeğe | FB-6.3.3 | — | 3 | bekliyor | `nf-db` | `supabase/migrations` |
| FB-6.3.5 | API ve web veri: lokasyonsuz izin, oy durumu | FB-6.3.2 | — | 5 | bekliyor | `nf-backend` | `schedule-requests-routes.ts`, web data |
| FB-6.3.6 | Requests → Time off ekranı: oy durumu (DEV varyantları) | FB-6.3.5 | — | 3 | bekliyor | `nf-arayuz` | `ScheduleRequestsPage.tsx` |
| FB-6.3.7 | Kırmızı izin dosyası yeşile | FB-6.3.4 | — | 2 | bekliyor | `nf-test` | `supabase/tests` |
| FB-6.3.8 | e2e: izin akışı | FB-6.3.6 | — | 3 | bekliyor | `nf-test` | `e2e/flows/time-off.spec.ts` |
| FB-6.3.9 | FB-6.3 kapanışı | FB-6.3.7, .8 | — | 1 | bekliyor | koordinatör | `tasks/FB-6.3.md` |
| FB-6.4 | Takas / Shift Hub: uygunluk motoru (görev dosyası yok) | FB-6.2.11 | — | 11 (tahmin) | bekliyor | çok rol | — |
| FB-6.5 | Availability çekirdeğe (görev dosyası yok) | FB-6.2.11 | — | 3 (tahmin) | bekliyor | çok rol | — |
| FB-6.6 | Belgeler / onboarding çekirdeğe (görev dosyası yok) | FB-6.2.11 | — | 8 (tahmin) | bekliyor | çok rol | — |
| FB-6.7 | Duyurular / önemli tarihler / bildirimler (görev dosyası yok) | FB-6.2.11 | — | 5 (tahmin) | bekliyor | çok rol | — |
| FB-6.8 | Ayarlar / hesap / workspace yaşam döngüsü (görev dosyası yok; en sonda) | FB-6.3.9, FB-6.4–6.7 | — | 9 (tahmin) | bekliyor | çok rol | — |
| A7 | Aşama 7: tek migration tabanı + hosted yeniden kurulum | FB-6.8, FB-6.1.14, FB-6.1b.3, BL-218.7 | — | 8 (tahmin) | bekliyor | `nf-db` + koordinatör + kullanıcı | `supabase/migrations`, hosted |

## 4. Sıradaki iş hesabı (yalnız "hazır" satırlar)
Sıralama: (i) arkasında bekleyen toplam puan (satırdan sonra zincir boyunca gelen bütün satırlar) → (ii) doğrudan açtığı satır sayısı → (iii) küçük puan.
| Sıra | ID | Hedef | (i) arkasında (satır) | (ii) doğrudan açtığı | (iii) puan |
|---|---|---|---|---|---|
| **1** | **S.D** (bekliyor; aktif hedefte başlayacak ilk satır) | SEC-003 (aktif) | 5 (2) | 1 | 2 |
| 2 | BL-218.3 | FOUNDATION-B | 120 (29) | 4 | 5 |
| 3 | FB-6.2.0 | FOUNDATION-B | 114 (27) | 1 | 1 |
| — | FB-6.1b.1 | FOUNDATION-B | 11 (2) | 1 | 3 |
| — | FB-6.1b.2 | FOUNDATION-B | 11 (2) | 1 | 3 |
**Gerekçe:** Tek hat kuralı gereği önce aktif hedef gelir. **SEC-003'te "hazır" satır kalmadı** (2026-09-28): S.A ve S.B sürüyor, S.1a, S.1b ve S.C incelemede. Aktif hedefte başlayacak ilk satır **S.D** (ekran metinleri); S.A ve S.B bitince hazır olur, arkasında S.E ve S.F var (5 puan). SEC-003 bitince FOUNDATION-B'de **BL-218.3** en uzun zinciri açıyor: FB-6.2.4 onu beklediği için bütün Çalışanlar, İzin, Ayarlar dilimleri ve Aşama 7 (120 puan) arkasında. **FB-6.2.0** puanı neredeyse aynı zinciri (114) tek puanlık bir ölçümle başlatıyor. Ölçüm tek başına bir `nf-planlama` işi olduğu için BL-218.3 ile çakışmıyor. Kullanıcı kararıyla BL-199 bu ikisinin önüne girer (§7).

## 5. Kararlar (açık; sorma sırası = durdurduğu puan)
| Sıra | K | Soru | Durdurduğu satırlar | Toplam puan |
|---|---|---|---|---|
| 1 | K10 | FB-6.3 S4 — onaylı iznin iptalini kim onaylar | FB-6.3.1 ve ardındaki 10 satır | 47 |
| 2 | K7 | FB-6.1 ekran turu günü | FB-6.1.0, .13, .14, A7 | 15 |
| — | K19, K20, K21, K23, K15 | BL-238 saat dilimi · BL-255 · BL-254 · denetim sırasının yeri · faturalama | aktif hedeflerde satır yok | 0 |
**Not:** K10'un satırları FB-6.2 bittikten sonra başlar. Ağırlık en yüksek olsa da cevap FB-6.3.1'e kadar gerekmez. **K22 kapandı 2026-09-28:** kullanıcı hosted panelde "Confirm email"i ve "Require current password / Secure password change"i açtığını yazdı (koordinatör penceresi); S.F artık yalnız S.E'yi bekliyor. Aktif hedefi (SEC-003) durduran açık karar kalmadı.

## 6. Paralel yerleşim (aynı anda en çok 2 ağır iş)
- **Şu an (SEC-003 içinde):** S.1b (`nf-db`, test sırasında `db.lock`) ve S.C (`nf-test`, e2e `db.lock`) ağır; ikisi aynı anda `db.lock` tutamaz (`scripts/lock.mjs` sıraya koyar). S.A ve S.B API ve web işi, ağır değil (tam kapı birleştirmede).
- **Aynı anda süren S.A ve S.B'nin dosya çakışması:** ana dosyaları ayrık (S.A `workspace-account-*`, `auth/verify-password.ts`; S.B `invitation-service`, `employee-create-service`, `account-security-*`, `app.ts`). **Bilinen ortak nokta:** `apps/api/src/account/account-security-service.ts` — S.B #2 için değiştiriyor; S.A birleştirmeden sonra onu ortak `verify-password.ts`'e bağlayacak (koordinatör: A yapar). Sıra: önce S.B'nin #2'si, sonra S.A'nın bağlaması. Ortak hata anahtarı `session.password_incorrect` iki dalda aynı yazılmalı. **Olası ortak dosyalar:** `packages/shared/src/index.ts` ve `apps/web/src/lib/supabase.ts`; dallar okunmadı, **ölçülmedi**.
- **SEC-003 bitince:** BL-218.3 (`nf-backend`) ile FB-6.2.0 (`nf-planlama` + bir `nf-test` koşusu) dosya paylaşmıyor, ikisi aynı anda gidebilir. FB-6.1b.1 ve FB-6.2.2–6.2.6 aynı `supabase/migrations` ailesine yazar: aynı anda tek `nf-db` adımı.

## 7. Hedef dışı (tek satırlık özet)
- **BL-199** (müdür Schedule'da vardiyaya not yazamıyor; 5 puan, tahmin): kullanıcı kararıyla SEC-003'ten hemen sonra, hedeflerin dışında. Yüzdelere girmez. Koordinatör, tek hat kuralıyla yerini teyit etmeli.
- **MVP'nin kalan fazları:** F0 (OPS-010, SEC-001), FJ (~%80), F1 (~%55), F2 (~%20), F3 (~%20), F4 (~%5, K15), F5 (~%30), F6 (başlamadı). Hepsi 2026-09-26 tahmini, ölçülmedi. FOUNDATION-B bitince sıra `ROADMAP.md`'den gelir.
- **Kod denetimi (BL-266..282):** SEC-003 dışındakiler backlog'da. Yerleri K23 ile kullanıcıya soruluyor.
- **Temizlik (koordinatör):** 43 birleşmemiş görünen dal, 34 worktree (sürüm 3 ölçümü). Arşiv adayı oturumlar: eski `nf-db` "BL-198" ve "Settings okumaları", "Code review", "ultrareview: bl252", "bl252-f6".
- **Kurallar (değişmedi):** çekirdeğe dokunan işler aynı anda yazılmaz; yerel `test:db` taban kırmızısı 18 dosya; SEC-003 ile BL-271 aynı dosya (`AuthContext.tsx`), BL-271 sonra; Pazar kuralı (BL-238 kapanana kadar, HANDOFF §0).
