# DURUM — 2026-10-09 06:05Z

🟢 main `021f82e0` yeşil (S9 treni indi, CI run 37887149560).

## Seni bekleyen (26 madde; B22 yok)

- Şu an işi durduran karar yok.
- **B1 Giriş modeli** (ertelendi: e-posta servisi bağlanana kadar, işi durdurmuyor): kod / ikisi / parola; önerilen e-posta + 6 haneli kod. EKRAN-16 R3 (S22) buna bağlı.
- B2 Marka seçimleri (sembol, motto, hareket, yerleşim A/B/C, pazarlama).
- B3 EKRAN-16 S1–S4 ve görsel G1–G4.
- B4 Requests tek tablo + C2 takas incelemesi görünüm bakışı; gelmeden C2 trene girmez.
- B5 nf-guvenlik'in 3 düşük bulgusu (C2): düzeltilsin mi, backlog'a mı.
- B6 Settings General: altı tasarımın "hiçbiri"; neyi beğenmedin?
- B7 Settings General: öneriler Ö1–Ö4; workspace saat dilimi modeli (önce sohbet).
- B8 Kurulum listesini admin de gizleyebilsin mi.
- B9 Jobs: 4 kapsam sorusu ("dönünce cevaplayacağım, unutma").
- B10 Jobs: New department'ın yeri (önce 2–3 varyant).
- B11 Locations: çekmecedeki 15 px kayma yalnız Locations mı, ortak mı.
- B12 Important Dates: kısa saatli günde vardiya varsayılanı.
- B13 Important Dates: All day kapalıyken girilen saat yalnız bilgi mi.
- B14 Bildirim: 6 temel model sorusu (önce sohbet).
- B15 Bildirim: varyant seçimi (merkez, ayar, telefon; A/B/C).
- B16 Schedule: S24 (BL-759) ve S25 (BL-238, önce sohbet).
- B17 Schedule görsel #86, #87, #88 (varyantla gelecek).
- B18 Şartlı: BL-969 canlı ölçümünde silinecek gerçek veri çıkarsa "evet"in (şu an yok).
- B19 GA-3 için ücretli `/code-review ultra` istiyor musun.
- B20 Yarım kalan 4. güvenlik sorusu ("uygulamamızın dizi başından beri …").
- B21 OTOMASYON-5'in 5 sorusu (önce v2 karşılıyor mu ölçülecek).
- B23 WORKFLOW-KONUSMASI §3'ün v2'nin karşılamadığı noktaları.
- B24 SABAH-SORULAR kalanı: G11 (BL-821), G14 (BL-968), S4–S23.
- B25 Uzak dal silme listesi (önce `git cherry` ile ölçülecek).
- B26 Makine: `C:\Users\TheWe\.codex` silme (14 GB), Supabase Studio kapatma, vmmem; hesap değişimi testi 2026-10-11 18:00 PT.
- B27 Para / CI: GitHub ücretsiz 2.000 dk sonrası; tavan; public repo.

## Bugün biten

- Main'e girdi (`7ecbcc74` → `a1c0ce64`, 04:43 UTC, CI yeşil, run 37881300203):
  - Project düzenine geçiş (`claude/project-thread-dk2dg9`).
  - BL-990 Time off onay e2e düzeltmesi (kök neden: e2e sayfaları hiç kapatılmıyordu).
  - BL-974.
  - GA-2: organizasyon ayarlarını yalnız owner ve admin değiştirebilir.
  - `coord/kayit` kayıtları.
- GA-2 migration'ı `20261008133054_organization_settings_stay_with_owner_and_admin.sql` paylaşılan yerel test DB'sine uygulandı (canlıya değil); kilit bırakıldı.
- Main alarmı temiz.
- S3: Requests'in artık kullanılmayan 6 eski fonksiyonu canlıdan silindi (migration 20261008111800, Mert'in evet'i 04:50Z). Doğrulama temiz: 6 fonksiyon yok, onları anan gövde yok, güvenlik uyarılarında yeni bulgu yok, 04:55 cron işleri başarılı. Yedek: artifacts\ekran-02\pkg\live-backup (Mert'in PC'sinde).
- S9: Schedule → Templates penceresi (#28/#29): şablon kaydederken çalışan adları artık varsayılan olarak korunuyor ('Remove employee names' kutusu boş başlıyor; önce adlar varsayılan olarak siliniyordu); şablon uygularken departman seçimi 'Only some departments' altında kapalı (önce hep açıktı). Ekran görüntüsünde bulunan sola hizalama hatası da düzeltildi. Kayıtlar: S-116 cümlesi, S-117..S-120, BL-993 main'de.
- S5 (EKRAN-01 #38, BL-579, `task/ekran-01-38`@`f6f27fd7`) kapandı, çıkmadı: Mert 2026-10-09 05:57Z kuralı değiştirdi (onaylı izinle 1 dakika bile çakışan vardiya yazılamaz/alınamaz; hücre kırmızı, "Time off" yazar). Canlıya ve main'e hiçbir şey gitmedi.

## Koşuyor

| İş | Nerede | Durum |
|---|---|---|
| Schedule test sayfası ve yeni şablon penceresi | bulut thread'i | Önce gerçek Schedule sayfasının her düğmesi çalışan Artifact kopyası (kalıcı test ortamı), sonra şablon penceresinin baştan tasarımı, en az 3 varyant. |
| Diğer hesaptaki sayfaları taşı | klasör thread'i | Mert'in okuma izni onayını bekliyor. |

## Sırada (⏸ = seni bekliyor)

| # | İş | Dal@sha | Kalan / engel | Sınıf |
|---|---|---|---|---|
| S2 | BL-985 e2e'de rastgele 60 sn takılmalar | — | BL-990'dan sonra kalan var mı ölç | normal |
| S4 | EKRAN-01 #12 Undo (BL-762) | `task/ekran-01-undo`@`53cb9276` | rebase (30 geride) → test:db → canlı | incelemeli (ONAY @baa144fb) |
| S6 | BL-969 Employees form kuralı | `task/bl-969`@`d3e8e6ad` → `task/bl-969-4` | push → CI → canlı ölçüm (⏸ B18 şartlı) → 2 migration | incelemeli |
| S7 | Requests C2 | `task/ekran-02-c2r`@`8ef7b05a` (yerel) | ⏸ B4 olmadan trene girmez | incelemeli |
| S8 | GA-3a Settings eski kapıdan çekirdeğe | yeni dal | GA-2'den sonra; ⏸ B19 | incelemeli |
| S10 | EKRAN-01 DB-4 (#3–#7, #10) | `task/ekran-01-db4`@`f5282ef2` | yeni dala 4 commit → test:db → inceleme → canlı | incelemeli |
| S11 | BL-959 kapalı günlü hafta 500 | — | kapandı mı doğrula | normal |
| S12 | EKRAN-10 Locations kod işi | yeni dal | ⏸ B11 işin başında | normal |
| S13 | BILDIRIM B1 söküm | yeni dal | söküm listesini yeniden ölç → taşı → sil | incelemeli (canlı) |
| S14 | EKRAN-08 kod işi | yeni dal | S11'den sonra; ⏸ B12, B13 | incelemeli |
| S15 | EKRAN-03 A4 liste okuması ya da A1 | yeni dal | BL-969 beklerken | normal / incelemeli |
| S16 | EKRAN-01 R1 maddeleri ve ölü kod | — | 71 açık madde | normal |
| S17 | EKRAN-01 40001 → PT409 | `task/ekran-01-40001` | — | incelemeli |
| S18 | OTOMASYON-4 kalanı | `task/otomasyon-4`@`145ba50f` (yerel) | v2 üstüne rebase; test 2026-10-11 | normal |
| S19 | EKRAN-03 c1a | `task/ekran-03-c1a`@`8cc2fbec` (yerel) | Requests C3'ü bekliyor | normal |
| S20 | EKRAN-10 Jobs kod işi | yeni dal | ⏸ B9, B10 | normal |
| S21 | EKRAN-10 General yeni tur | — | ⏸ B6 | normal |
| S22 | EKRAN-16 R3 görev dosyası | — | B1 (ertelendi: e-posta servisi bağlanana kadar) | incelemeli |
| S23 | GA-3b RLS politikaları | — | GA-3a'dan sonra | incelemeli |
| S24 | Kayıt işleri (belge) | — | — | normal |
| S25 | Temizlik: main'e girmiş yerel dallar ve worktree'ler | — | `git cherry` boş olmalı | normal |
| S26 | BL-995: eski 'izni kısaltarak vardiya alma' akışının kaldırılması (riskli canlı migration). Başlamadan önce Mert'e iki soru: Shift Hub'da çakışan açık vardiya gizli mi, gri ve nedenli mi; izin onaylanırken o saatte yayınlanmış vardiya varsa ne olur. | — | ⏸ Mert'in 'şimdi mi, sonra mı' cevabı bekleniyor. | incelemeli (canlı) |

## Trene hazır

- `coord/kayit`@`86903f43` — EKRAN-01 devir notu düzeltmesi.
- `coord/kayit`@`df0dd9c1` — BL-994: ortak yerel DB'de `scheduling_settings_shift_types_rls` 12/13/23 kırmızı.
- `coord/kayit`@`62587c5` — yeni kural KARARLAR §1.1 + P24 notu, BL-995, BL-579 kapandı, EKRAN-01 #38 ve S6 notları.

## Tren

- Koşan tren yok. Son tren `train/20261009T0508Z` main'e indi (`021f82e0`, CI yeşil, run 37887149560); `coord/kayit`'ı `355546a4`'e kadar taşıdı (`ca1d95e2` dahil).
- Sonraki tren: `coord/kayit`@`86903f43`, `df0dd9c1` ve `62587c5`. Karantina satırının silinmesi BL-990 ölçütünde.

## Senin yerine verdiğim kararlar

- Yok.

## Plan

- Sıradaki: Schedule'ı bitirmek (Mert'in önceliği).
- Süreç dondurması: migration main'e girdi, bir haftalık dondurma şimdi başladı (2026-10-16'ya kadar).
- Mert'in 9 Ekim kararları (KARARLAR S-117..S-120, `coord/kayit`@`ca1d95e2`, sonraki trenle gidiyor):
  - Öncelik: önce main yeşil, sonra Schedule bitirilir.
  - B1 (giriş modeli) e-posta servisi olana kadar ertelendi.
  - 6 çalışma kuralı kabul; aralarında migration main'e girdiği andan başlayan bir haftalık süreç dondurması var.
  - Kararlar günde 3–5 kart olarak gelir; ilk kartlar Schedule'dan.
- Tren main'e girince Project düzeni (S-116) geçerli: eski koordinatör oturumu, `coord/kayit`, `/oto`, `/durum` emekli; BL-992 (artık kancalar) `coord/kayit` main'e girdikten sonra.
- Devirden açık: `e2e/flows/scope-and-employee-view.spec.ts:80` yerelde kırmızı, CI'da değil (büyük ihtimalle paylaşılan yerel DB kayması) → `BACKLOG.md`'ye yeni numarayla.
- N4: EKRAN-02 canlı yedeği (`artifacts\ekran-02\pkg\live-backup`, 111800 uygulanana kadar saklanacaktı) artık silinebilir; koordinatör kararı: Schedule turu bitene kadar (en az 2026-10-16) saklanıyor.
- Eski BL-990 worktree'si (`C:\Users\TheWe\Documents\Codex\newfork-clean\.claude\worktrees\agent-adc5b7c78af9b7328`) ara ürünler kopyalanana kadar silinmez.
- Açık söz: BL-990 sonuç verince ya da takılınca sana haber verilecek.
- S25 temizlik listesi: `task/bl-990-w2` ve `task/ekran-01-templates`@`94fdfc57` (yerel, gereksiz); `task/ekran-01-38` (yerel + origin) ve worktree `C:\Users\TheWe\Documents\Codex\newfork-wt\ekran-01-38`. Main'e girmedi: silmeden önce `archive/ekran-01-38` etiketi ve Mert'in açık 'evet'i gerekir.
- BACKLOG notu: BL-991 ve BL-992 açık maddeler ama `BACKLOG.md`'nin kapanmış bölümünün sonunda duruyor (`a489ed4`'ten kalan yer hatası); bir sonraki kayıt işinde düzeltilecek.
- Tarihler: hesap değişimi testi ve haftalık kullanım sıfırlaması 2026-10-11 (test 18:00 PT); karantina bitişi ve ölçüm günü 2026-10-15.

## Sağlık

- İşçi sınırı 1 (aynı anda tek kod yazan thread).
- Main `021f82e0` (S9 treni). Main alarmı temiz (`since` `021f82e0`).
- Main CI 🟢 (run 37887149560).
- Etkin karantina: yalnız `time-off-approval.spec.ts:91` (2026-10-08 → 2026-10-15; koordinatör bir kez uzatabilir). :145 ve :160 da düşüyor; karantina tek başına CI'ı yeşil tutmuyor. Yeni karantina eklenmedi.
- Kilit `db.lock` boş (GA-2 migration'ından sonra bırakıldı).
- Kullanım (02:52Z): 5 saatlik %2, haftalık %64.
