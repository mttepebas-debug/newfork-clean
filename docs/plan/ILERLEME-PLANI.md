# İlerleme planı — hesaplı (sürüm 5, 2026-09-28)

Hazırlayan: `nf-planlama` (`local_c67b8d60-…`). Koordinatör: "Koordinatör — devir 2026-09-28", `local_41428574-b1a9-44cb-9a7c-cd34afc9456a`.
Ölçüm: `origin/main` `10c11be5`, 2026-09-28 (SEC-003 kod kısmı `721ea41f`, main CI yeşil run 36445247470; hosted gönderim aynı gün, koordinatör); önceki ölçüm `721ea41f`; SEC-003 commit'leri `34fc2075`, `3eeb4c11` (`nf-db`), `6887fbbc` (`nf-backend`), `d0751603`, `0d03389e`, `74e2d363` (`nf-test`) — hepsi `git cat-file` ile doğrulandı; durumlar koordinatörün 2026-09-28 güncellemesiyle. Hesap betiği: satırlar, bağımlılıklar ve puanlar bu dosyadaki tablolardır; sayıları elle değil betikle ürettim, tablo değişince aynı yolla yeniden hesaplanır.

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
| SEC-003 hesap güvenliği paketi | 26 / 26 | **%100 — bitti** (2026-09-28, `10c11be5` + hosted) | Hedef kapandı; yayın öncesi şartlar §8'de. |
| **FOUNDATION-B — Aşama 6–7** (**aktif**, 2026-09-28'den) | 77 / 230 | **%33,5** (2026-09-28, `10c11be5`; değişmedi) | Bitenlerin 61 puanı FB-6.1'in 14 adımının geriye dönük puanı (tahmin). Açık dilimlerden FB-6.4–6.8 ve Aşama 7 görev dosyasız (tahmin, 44 puan). |
| FOUNDATION-B — program geneli (bilgi) | 155 / 308 | %50,3 (tahmin) | Aşama 1–5 bitti; plandaki süre orta noktaları × 8 = 78 puan sayıldı. Eski "~%58" formülünün yerine geçer; ikisi farklı ölçü, karşılaştırılmaz. |

## 2. İş tablosu — SEC-003 (bitti 2026-09-28; kayıt için)
Kaynak: `tasks/SEC-003.md`, koordinatör girdisi 2026-09-28, dallar yukarıda.
| ID | Ne (kişi için) | Bağlı olduğu | Karar | Puan | Durum | Rol | Ana dosyalar |
|---|---|---|---|---|---|---|---|
| S.0 | Görev dosyası ve kararlar | — | — | 1 | bitti | `nf-planlama` | `tasks/SEC-003.md` |
| S.1a | Eski parolasız hesap silme yolu veritabanından kalkar; davet kabulü onaylı e-posta ister | — | — | 3 | bitti (`721ea41f`) | `nf-db` | `supabase/migrations`, `supabase/tests` |
| S.1b | Onaysız hesap davet listesini görmez, reddedemez (`3eeb4c11`); yerel `enable_confirmations`; D-1 | S.1a | — | 2 | bitti (`721ea41f`) | `nf-db` | `supabase/migrations`, `supabase/config.toml` |
| S.A | Account → Workspaces'te kapatma ve sahiplik devri parolayı sunucuda sorar (#3; planlı kapatma "Close at end of period" penceresine var olan parola alanı gelir, iki ölü `reauthentication_required` dalı silinir; ortak yardımcı `apps/api/src/auth/verify-password.ts`, hata anahtarı `session.password_incorrect` S.B ile ortak); eski silme rotaları kalkar (#4, `6887fbbc`) | — | — | 5 | bitti (`721ea41f`) | `nf-backend` | `apps/api/src/account/workspace-account-*`, `apps/api/src/auth/verify-password.ts`, `packages/shared`, `apps/web/src/lib/supabase.ts`, `WorkspacesPage.tsx` |
| S.B | Davet, silinen hesabın kilidini açmaz (#1); Account → Security'de parola değişimi mevcut parolayı ister (#2; hata anahtarı `session.password_incorrect`, S.A ile ortak); O-1 ve testi; davet kabulünün API tarafı ve görünen ad (#9) | S.1a | — | 5 | bitti (`721ea41f`) | işçi oturumu (`nf-backend` kuralları) | `apps/api/src/employees/invitation-service.ts`, `employee-create-service.ts`, `apps/api/src/account/account-security-*`, `apps/api/src/app.ts` |
| S.C | Uçtan uca: parola değişimi ve devir parolayla; yeni owner yerel posta kutusundan e-postasını onaylar | — | — | 3 | bitti (`721ea41f`) | `nf-test` | `e2e/**`, `.github/workflows/ci.yml` |
| S.D | Ekran metinleri: "e-postanı doğrula" ve "parola yanlış" | S.A, S.B | — | 2 | bitti (`721ea41f`) | `nf-arayuz` | giriş/kayıt ekranı, Account → Security |
| S.E | Birleştirme: tam kapı, `nf-guvenlik`, `nf-gorsel-qa` (Account → Workspaces'te ekran değişti), ultrareview önerisi (kullanıcı 2026-09-28: ultrareview istemedi), yerel auth yeniden başlatma (kullanıcı izin verdi) | S.1b, S.A, S.B, S.C, S.D | — | 3 | bitti (`721ea41f`) | koordinatör | — |
| S.F | Hosted: BL-265 — `20260928040000` + `20260928050000` gönderimi (D1 sayımı 0/0, koordinatör 2026-09-28; "Confirm email" kullanıcı tarafından açıldı, K22 kapandı). **Yayın öncesi şart:** hosted e-posta teslimatı (SMTP, saatlik sınır) ölçülür ve S.D'nin "e-postanı doğrula" ekranı main'de; **BL-283** API parola doğrulamasına hesap başına deneme sınırı (kullanıcı kararı 2026-09-28; SEC-003 kapsamı dışında, yüzdeye girmez) — hepsi web/API yayınından önce | S.E | — | 2 | bitti (hosted 2026-09-28) | koordinatör + kullanıcı (gönderim onayı) | hosted |

## 3. İş tablosu — FOUNDATION-B Aşama 6–7 (aktif hedef)
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
| **1** | **BL-218.3** | FOUNDATION-B (aktif) | 120 (29) | 4 | 5 |
| 2 | FB-6.2.0 | FOUNDATION-B (aktif) | 114 (27) | 1 | 1 |
| — | FB-6.1b.1 | FOUNDATION-B | 11 (2) | 1 | 3 |
| — | FB-6.1b.2 | FOUNDATION-B | 11 (2) | 1 | 3 |
**Gerekçe (yeniden hesap 2026-09-28, SEC-003 bitti):** Aktif hedef artık FOUNDATION-B. Hesapta ilk sırada **BL-218.3**: FB-6.2.4 onu beklediği için Çalışanlar, İzin, Ayarlar dilimleri ve Aşama 7 (29 satır, 120 puan) arkasında; doğrudan 4 satırı açıyor. İkinci **FB-6.2.0**: neredeyse aynı zinciri (114) tek puanlık bir ölçümle başlatıyor, BL-218.3 ile dosya paylaşmıyor. FB-6.1b.1 ve .2'nin arkasında yalnız 11 puan var. **Durum 2026-09-28:** kullanıcı önce bekletti ("şimdilik dur"), sonra BL-199'u başlattı ("S1–S5 hepsi önerilen, başlasın"). **Şimdiki iş BL-199:** kullanıcı 2026-09-28'de "SEC-003'ten sonra BL-199" dedi (§7). BL-199 hedef dışı ve yüzdeye girmez; hesap onu sıralamaz, kullanıcı kararı öne alır. BL-199 bitince sıra hesaptan gelir: BL-218.3, sonra FB-6.2.0.

## 5. Kararlar (açık; sorma sırası = durdurduğu puan)
| Sıra | K | Soru | Durdurduğu satırlar | Toplam puan |
|---|---|---|---|---|
| 1 | K10 | FB-6.3 S4 — onaylı iznin iptalini kim onaylar | FB-6.3.1 ve ardındaki 10 satır | 47 |
| 2 | K7 | FB-6.1 ekran turu günü | FB-6.1.0, .13, .14, A7 | 15 |
| — | K19, K20, K21, K23, K15, K24 | BL-238 saat dilimi · BL-255 · BL-254 · denetim sırasının yeri · faturalama · K24: kurulumu bitmemiş workspace'ten davet gitmişse kapatma yine parolasız kalsın mı (BL-284; tek hat gereği SEC-003'ten sonra sorulur) | aktif hedeflerde satır yok | 0 |
**Not:** K10'un satırları FB-6.2 bittikten sonra başlar. Ağırlık en yüksek olsa da cevap FB-6.3.1'e kadar gerekmez. **K22 kapandı 2026-09-28:** kullanıcı hosted panelde "Confirm email"i ve "Require current password / Secure password change"i açtığını yazdı (koordinatör penceresi); S.F artık yalnız S.E'yi bekliyor. Aktif hedefi (SEC-003) durduran açık karar kalmadı. **Kararlar tablosu dışında açık onay:** S.F için hosted gönderim onayı (kullanıcının kendi "evet"i; CLAUDE.md §8) — koordinatör soruyor.

## 6. Paralel yerleşim (aynı anda en çok 2 ağır iş)
- **Şimdi:** BL-199 tek iş (kullanıcı kararı). Parça 1 `nf-arayuz` (düzenleyicide not alanı + kart simgesi; `apps/web/src/schedule/components`) ∥ parça 2 `nf-db` (pano cevabından iş arkadaşı notu; `supabase/`) dosya paylaşmıyor, aynı anda gider → parça 3 `nf-test` (testler + e2e). Ağır iş: parça 2 migration denemesi ve e2e (`db.lock`).
- **BL-199'dan sonra, ilk iki hazır satır:** BL-218.3 (`nf-backend`; `packages/shared`, `apps/api/src/schedule`, web schedule/employees veri dosyaları) ile FB-6.2.0 (`nf-planlama` ölçümü + bir `nf-test` koşusu, `roles_permissions_rls` ve `employee_hub`) **dosya paylaşmıyor**; ikisi aynı anda gidebilir. Ağır iş yalnız FB-6.2.0'ın `test:db` koşusu (`db.lock`).
- FB-6.1b.1 ve FB-6.2.1–6.2.6 aynı `supabase/migrations` ailesine yazar: aynı anda tek `nf-db` adımı. BL-218.5a (`nf-db` okuma) BL-218.3'ün sözleşmesini bekler.
- SEC-003'ün paralel yerleşim notları (S.A/S.B ortak dosyası) iş kapandığı için düştü.

## 7. Hedef dışı (tek satırlık özet)
- **BL-199** (müdür Schedule'da vardiyaya not yazamıyor; **hazır** 2026-09-28 — kapsam onaylı, S1–S5 (a), kullanıcı: "S1–S5 hepsi önerilen, başlasın"; görev dosyası `tasks/BL-199.md`; 10 puan tahmin: parça 1 `nf-arayuz` 5 ∥ parça 2 `nf-db` 2 → parça 3 `nf-test` 3; önceki tahmin 5): kullanıcı kararıyla SEC-003'ten sonraki tek iş. Hedeflerin dışında; yüzdelere girmez.
- **MVP'nin kalan fazları:** F0 (OPS-010, SEC-001), FJ (~%80), F1 (~%55), F2 (~%20), F3 (~%20), F4 (~%5, K15), F5 (~%30), F6 (başlamadı). Hepsi 2026-09-26 tahmini, ölçülmedi. FOUNDATION-B bitince sıra `ROADMAP.md`'den gelir.
- **Kod denetimi (BL-266..282):** SEC-003 dışındakiler backlog'da. Yerleri K23 ile kullanıcıya soruluyor.
- **Temizlik (koordinatör):** 43 birleşmemiş görünen dal, 34 worktree (sürüm 3 ölçümü). Arşiv adayı oturumlar: eski `nf-db` "BL-198" ve "Settings okumaları", "Code review", "ultrareview: bl252", "bl252-f6".
- **Kurallar (değişmedi):** çekirdeğe dokunan işler aynı anda yazılmaz; yerel `test:db` taban kırmızısı 19 dosya (`artifacts/koordinator/sec003-red.txt`; yeni fark `security_audit_events`, BL-288); SEC-003 ile BL-271 aynı dosya (`AuthContext.tsx`), BL-271 sonra; Pazar kuralı (BL-238 kapanana kadar, HANDOFF §0).

## 8. Yayın öncesi şartlar (web/API hosted yayınından önce; hedef yüzdelerine girmez)
| Şart | Kaynak | Durum |
|---|---|---|
| Hosted e-posta teslimatı ölçülür (hangi SMTP, saatlik sınır; onay e-postası Supabase Auth'tan gidiyor) | SEC-003 pre-mortem, koordinatör 2026-09-28 | ölçülmedi |
| BL-283 — API parola doğrulamasına hesap başına deneme sınırı | kullanıcı kararı 2026-09-28 | açık |
| "Check your email" ekranı main'de | SEC-003 S.D | **bitti** (`721ea41f`) |
**Öneri (`nf-planlama`, kullanıcı kararı değil):** kod denetiminin kalan yüksek güvenlik maddeleri — BL-270 (admin → admin erişim kaldırma), BL-271 (çıkışta önbellek), BL-276 (eski yetki kapısı) — da yayından önce kapansın. Yerleri K23 ile sorulacak.
