# Ekran 1 — Schedule: kabul listesi (EKRAN-01)

## Mert için özet
- **İş kaybı bitti:** hareketsizlikte silinen iş, sunucuda geri almayan Undo, düşen kilit, yenilemede boş taslak, iki müdürün işinin karışması (BL-688–692) kapandı; kodda ve testte doğrulandı (2026-10-07).
- **En ağır 5 açık hata:**
  1. Los Angeles'taki Ayşe Pazar 18:00'de gelecek haftayı düzenleyemiyor; sunucu günü UTC'ye göre sayıyor (BL-238). Senin S25 sohbetini bekliyor.
  2. Ayşe Kadıköy'deki Salı vardiyasını Beşiktaş'a taşıyıp yalnız Beşiktaş'ı yayınlarsa vardiya iki lokasyonda yayında kalıyor, o haftada Edit açılmıyor (BL-759). S24'ü bekliyor.
  3. Ali'nin Salı izni onaylandıktan sonra eski yayındaki Salı vardiyası bazı yollardan izin kontrolü olmadan yayına yazılabiliyor (BL-174). Düzeltme hazır, Requests'in veri paketini bekliyor.
  4. E-posta servisi 15 dakika çökerse haftalık Schedule e-postası kendiliğinden kapanıyor; Pazar e-postası bir daha gitmiyor (BL-795).
  5. Şablonda tek vardiya dinlenme kuralına takılırsa bütün şablon "A current conflict acceptance is required" hatasıyla düşüyor (BL-191).
- **Gözle karar bekleyen (gerçek ekranda 2–3 varyant):** dar pencerede üst çubuk (BL-445, BL-233), tek lokasyonlu haftada Pazar sütunu (BL-717), iki Templates yüzeyinden hangisi kalır (BL-722).
- **Kararı zaten verilmiş olanlar** (Replace iki tık, Unassigned satırı gizli, pencereler stil B, 37 prototip cilası, Publish sayım cümlesi) sana yalnız önce/sonra görüntüsüyle bilgi olarak gelir.

---

- **Durum: taslak.** Koordinatör "başla" deyene kadar kod yok (görev, 2026-10-07). Liste Mert'e liste olarak gitmez (DERSLER 2026-10-07); Mert'in kararı yalnız yukarıdaki üç görsel madde ve S24 / S25 için gerekir.
- **Yazan:** Schedule'ın tek sahip oturumu (`oturum/ekran-01`), 2026-10-07. Taban `origin/main` `d57be38c` (ölçüm `6468fe6e`; arası yalnız belge). Dal `task/ekran-01`, worktree `newfork-wt/ekran-01`.
- **Kaynaklar:** `OZET.md`, `KAPANIS-OLCUMU-2026-10-06.md`, `tasks/EKRAN-01-SCHEDULE.md` (dilimler; kayıt olarak kalır, iş yalnız bu listeden izlenir), KARARLAR "Schedule", dilim arşivleri `uygulama/*.md`, `task/ekran-01-db4` dalı, SABAH-SORULAR S24 / S25.
- **Tazelik:** 119 BL (görev dosyasındaki 114 + dilim incelemelerinden gelen BL-758, BL-759, BL-761, BL-762 + sınırdaki BL-795) `origin/main`'e karşı yeniden ölçüldü: 5 okuma ajanı + öncelikli 7 madde elle. Hükümler maddelerin içinde; kapanmışlar §3'te.

## Nasıl okunur
- **Durum:** ⏳ açık · ⏳ dalda hazır (yapıldı ve incelendi, main'de değil) · ✅ `<main sha>` · ⏭ BL-xxx (Mert'in onayıyla dışarı).
- **Sınıf** (CLAUDE.md §4.3): R0 belge / yalnız test · R1 tek ekran · R2 paylaşılan parça · R3 yetki, satır erişimi, silme, canlı DDL. Listede R3 var: iş sınırında `nf-guvenlik` zorunlu.
- **Örnek kişiler:** Kadıköy müdürü Ayşe, Kadıköy'ün öteki müdürü Can, Beşiktaş müdürü Mehmet, admin Zeynep, owner Mert, çalışanlar Ali, Deniz. Los Angeles lokasyonu Palo Alto haftası örneklerinde.
- **"Ölç" yazan madde:** kod okuması karar vermedi; ilk adım tarayıcıda ya da kırmızı testle ölçmek. Geçerli çıkmazsa kanıtıyla kapanır.

## 1. Dal envanteri (2026-10-07)
| Dal | Ne | Durum |
|---|---|---|
| `task/ekran-01-db4` (`f5282ef2`, worktree `.claude/worktrees/gallant-feistel-508e83`) | DB-4: BL-371, BL-510, BL-174, BL-701 DB yarısı, BL-326 kilit testi, BL-191 ölçüm testi, BL-759 kırmızı TODO testi. Migration `20261007180000_publish_rules_name_and_override.sql`, `ci-green.txt` +4 satır. `nf-guvenlik` ONAY @`38641cdf` | Requests'in veri paketinin (a1a2 → a3 → a4) dört migration'ı üstüne kurulu, main'in 59 commit gerisinde. Paket main'e girince bu dal yeni main'e taşınır, yeniden kapı, sonra gönderim (R3, koordinatörün "gönder" izni) |
| `task/ekran-01-be-2b-o1` | Geçici hatada e-postayı bir kez yeniden deneme | **Main'de:** `0003da6e`, `c42c2c0e`, `38b7f801`. Yerel dal yok; yalnız `refs/nf-backup/branch/task/ekran-01-be-2b-o1/*` yedekleri (`git cherry` boş). Madde #24 ✅ |
| `task/ekran-01-undo-db-bulgu` | — | Yok (silinmiş). Uzakta `task/ekran-01*` dal yok |

## 2. Kabul listesi
98 madde. Sınıf: R3 16 · R2 16 · R1 56 · R0 7 · sınıfsız 3 (kapanış). Durum: 1 ✅ · 5 dalda hazır · 92 açık. Açıkların 5'i Mert'i (S24, S25, üç varyant), 2'si Requests'in veri paketini bekliyor; 12'si önce ölçülecek (#9, #50, #59, #60, #72, #73, #77, #78, #79, #83, #84, #93).

### 2.1 Yanlış veri ve yayın kuralları (veritabanı)
| # | Davranış (kim, ne yapar, ne görür) | Sınıf | Kanıt (test / görüntü) | Durum |
|---|---|---|---|---|
| 1 | Los Angeles'taki Ayşe Pazar 20:00'de (PT) gelecek haftayı açar, düzenler, kaydeder ve yayınlar; "Past schedule weeks are read-only" görmez. "Bu hafta" lokasyonun saatiyle hesaplanır; önemli tarih ve kapalı gün okumaları aynı sınırı kullanır (BL-238). Bugün `schedule_current_week_start_service` çıplak `current_date` (UTC) kullanıyor (`20260819010000_schedule_publication.sql:173-186`); düzenleme, kaydetme, yayın / yayından kaldırma önizlemesi ve önemli tarih fonksiyonları onu çağırıyor | R3 | pgTAP sabit saat (Pazar 20:00 PT); e2e `schedule-locks.spec.ts` Pazar penceresinde yeşil | ⏳ S25 (Mert, önce sohbet) |
| 2 | Ayşe Kadıköy'deki Salı vardiyasını Beşiktaş'a taşır, yalnız Beşiktaş'ı yayınlar; sonra o haftada Edit açılır (23505 yok) ve vardiya yayında tek lokasyonda durur (BL-759). Bugün Edit açılışı vardiyayı her lokasyonun "current" yayınından alıyor (`20261007120000_schedule_undo_goes_back_on_the_server.sql:501-509`) | R3 | `availability_always_warns` son hücre (dalda kırmızı TODO) | ⏳ S24 (Mert) |
| 3 | Ali'nin Salı vardiyası önceki yayında olsa da, Salı izni onaylandıktan sonra hiçbir yazma yolu o vardiyayı izin kontrolü olmadan yayına koyamaz; kabul edilmiş müsaitlik / dinlenme uyarısı korunur (BL-174). Bugün tetikleyici önceki yayında aynı vardiyayı görünce kontrolsüz geçiyor (`20261007000000_availability_always_warns.sql:358`) | R3 | `published_shift_rechecks_time_off` | ⏳ dalda hazır: db4 @`38641cdf` |
| 4 | Ayşe New Schedule ▾ menüsünde "Published by Unknown" yerine yayınlayanın adını görür; ad boşsa "Team member" (BL-371). İnceleme notu: ad hesap adından, ızgara workspace kaydındaki addan okuyor; tek kaynağa bağlanır | R2 | `schedule_publication_status_names_source_draft` | ⏳ dalda hazır: db4 @`28f2e513` |
| 5 | Kimsenin geçemeyeceği bir bulguya karar yazılırsa yayın durur: "This schedule conflict cannot be overridden" (BL-510; bugün oluşmuyor, kural kilitlenir, P23) | R3 | `time_off_pending_publish_note` 11. hücre | ⏳ dalda hazır: db4 @`28f2e513` |
| 6 | Ayşe'nin yalnız Kadıköy'ü kapsayan taslağı Beşiktaş'ı yayınlayamaz (BL-326; kural main'de, testi yoktu) | R3 | `publish_stays_in_its_draft` | ⏳ dalda hazır: db4 @`38641cdf` |
| 7 | Önemli tarih ve kapalı gün listesini Schedule okuması kendisi verir; lokasyon kapsamı veritabanında (BL-701, DB yarısı) | R3 | `schedule_read_model_important_dates` | ⏳ dalda hazır: db4 @`38641cdf` |
| 8 | API'deki önemli tarih sorgusu ve TypeScript süzgeci silinir (`apps/api/src/schedule/schedule-service.ts:480-525`); ekran aynı tarihleri görür (BL-701, API yarısı) | R2 | API testi; `rg importantDateTouchesRange apps/api` boş | ⏳ #7'den sonra |
| 9 | Ali taslaktaki Salı vardiyasındayken arşivlenir ya da Cook işinden çıkarılırsa yayın o vardiyayı yayınlamaz; Undo ile geri gelen eski atama dahil (BL-761) | R3 | yeni pgTAP (arşiv, iş ataması, Undo sonrası) | ⏳ ölç: iki kod okuması çelişiyor (DB-1c incelemesi "yayın kontrol etmiyor"; bugünkü okuma "önizleme `employee_inactive` / `assignment_missing` ile engelliyor", `20261007000000…:120-131`). Kırmızı test önce; geçerse madde kilit testiyle kapanır |
| 10 | Şablon ya da Auto-fill aynı kişiye dinlenme kuralını çiğneyen iki vardiya verirse bütün işlem ham hatayla düşmez (BL-191). Bugün şablon çakışmayı açık vardiyaya çeviriyor, dinlenmede kontrol yok; yazma tetikleyicisi bütün işlemi 23514 ile durduruyor (DB-4 ölçümü) | R3 | `schedule_bulk_paths_keep_rest` (dalda ölçüm testi) | ⏳ soru (koordinatör): çakışmadaki gibi açık vardiyaya mı çevrilsin |
| 11 | Vardiya kaydında yük mola ya da "saati gizle" alanını taşımazsa mevcut değer korunur; bugün 0 / false oluyor (`20261007090000_templates_and_published_weeks_keep_their_data.sql:573-574`; not alanı BL-292 ile düzeldi, bu ikisi kaldı). YENİ (DB-3 artığı) | R3 | pgTAP (`shift_note_survives_every_path` yanına) | ⏳ ekran bugün alanı hep gönderiyor; gizli kusur |
| 12 | Undo'nun kenarları: 25 adım doluyken lokasyon eklemek en eski adımı düşürmez; kapalı gün sınırında Undo'nun davranış testi var; adım sırası aynı anda iki sekmede bozulmaz (BL-762; sıra artık zaman + işlem numarası, kısmen düzeldi) | R3 | `schedule_edit_session_undo` | ⏳ |
| 13 | İzin onayı ve kapalı gün, vardiyayı açık vardiyaya düşürme adımlarını tek yardımcıda yazar; ikiz kopya yok (BL-544; `20261007120000…:556,624` ve `time_off_release_shifts`) | R3 | var olan testler yeşil | ⏳ sınırda: madde EKRAN-08'i de anıyor; koordinatör seçer |
| 14 | "Kim bakıyor" kanalında kimlik sunucudan doğrulanır; Kadıköy'de Ayşe kendini Mehmet gibi "düzenliyor" gösteremez (BL-758; bugün kimlik tarayıcıdan, `useScheduleViewerPresence.ts:90,117-118`) | R3 | kanal politikası testi | ⏳ |
| 15 | Taslak ya da şablon adı başka lokasyonun adını yoklamaya yaramaz (BL-702 kalanı; şablon adı workspace genelinde benzersiz, `20260819150000…:90`) | R3 | pgTAP | ⏳ soru (koordinatör): ad benzersizliği lokasyon başına mı |
| 16 | Ölü fonksiyon `get_schedule_publication_history_service` silinir (BE-1 artığı; API çağırmıyor, iki testte geçiyor) | R3 | `retired_objects_stay_gone` | ⏳ Requests veri paketi girdikten sonra (katalog dosyası) |
| 17 | Ölü pending-ops uçları silinir: API POST / PATCH / DELETE (`schedule-routes.ts:368,390,414`) ve DB'deki ekle / güncelle / sil servisleri; onları çağıran pgTAP satırları taşınır (BL-168 kalanı) | R3 | rota 404 testi, `retired_objects_stay_gone` | ⏳ Requests veri paketi girdikten sonra |

### 2.2 Dışa aktarma ve haftalık e-posta
| # | Davranış | Sınıf | Kanıt | Durum |
|---|---|---|---|---|
| 18 | Owner Mert, izindeki Ayşe'nin kurduğu Moda e-posta kuralının adresini değiştirir; Can Kadıköy kuralını kim kurduysa düzenler; bütün lokasyonları arşivli kuralı yalnız owner / admin düzeltir (BL-494, KARARLAR 2026-10-01). Bugün kural yalnız kurana ait (`20261003000000_an_archived_location_counts_nowhere.sql:851`) | R3 | pgTAP + API testi | ⏳ |
| 19 | Schedule → Export panelinde haftalık e-posta bölümü: kural kurulur, listelenir, düzenlenir (BL-437). Eski Export bileşenleri (~9 dosya, ~1.700 satır) ve `App.test.tsx:1375` yokluk kilidi silinir. Hangi haftanın gittiği bugünkü gibi kalır (Mert, Soru 6) | R2 | vitest + e2e Export + önce/sonra | ⏳ |
| 20 | E-posta servisi 15 dakika yanıt vermezse aynı saatin tekrar denemeleri tek hata sayılır; kural üç denemede kapanmaz (BL-795; `schedule-export-cron.ts:16,135-140,285-297`) | R2 | API testi (sahte saat) | ⏳ sınırda: BACKLOG'da Availability keşfinde yazılı, iş Schedule → Export'un |
| 21 | Canlıda haftalık e-posta tetiklenir ve gider (BL-101 kalanı: kod kusurları kapandı; canlı Vault ayarı ve Resend anahtarı ölçülmedi, BACKLOG'daki iki not çelişiyor) | R0 | canlıda bir test e-postası | ⏳ canlı ölçüm; anahtar işlemi Mert'in |
| 22 | Zamanlanmış e-posta tetiğinin sırrı sabit sürede karşılaştırılır (BL-282'nin Schedule kalemi; `schedule-export-cron-routes.ts:29`, 4 kopya) | R2 | API testi | ⏳ |
| 23 | Eski Export API uçları silinir: `/schedule/export/preview`, `/schedule/export/preview-html`, `/schedule/export` (`schedule-routes.ts:682,707,740`; BE-2 artığı) | R2 | rota 404 testi | ⏳ |
| 24 | Pazar 18:00'de 12 kişiye giden e-postanın 3'ü hız sınırına takılırsa o 3 kişiye aynı koşuda bir kez daha gönderilir (BE-2b-O1, KARARLAR Schedule 2026-10-06) | R2 | `schedule-export-cron.test.ts:127` | ✅ `0003da6e` (+`c42c2c0e`, arşiv `38b7f801`) |

### 2.3 Kararı verilmiş, ekranda olmayan
| # | Davranış | Sınıf | Kanıt | Durum |
|---|---|---|---|---|
| 25 | Müdür görünüm modunda Unassigned satırını görmez; Edit'te görür (BL-681; `scheduleGridViewModel.ts:69-70`) | R1 | vitest + önce/sonra | ⏳ |
| 26 | New Schedule ▾ → "Save as template" taslaktan şablon kaydeder (BL-705, BL-038 K1; düğme `DraftDropdownMenu.tsx:453-463`'te hazır ve testli, sayfa bağlamıyor) | R1 | vitest | ⏳ |
| 27 | Templates'te "Add to current shifts" / "Replace current shifts"; Replace'in ilk tıkı "24 shifts will be removed. Draft only, not published." yazar, ikinci tık "Confirm replace" (BL-694, BL-038 K2, KK-162). Veri hazır (DB-3); API önizleme ucu ve mod adı (`overwrite` → `replace`) eksik; ekran tek tık (`ScheduleTemplateDialogs.tsx:227-242`) | R2 | vitest + API testi + e2e + önce/sonra | ⏳ |
| 28 | Şablon kaydederken çalışan adları varsayılan korunur; "Remove employee names" seçilirse vardiyalar açık vardiya olur (BL-038 K3; bugün tersi: "Save shifts as open slots" varsayılan açık, `ScheduleTemplateDialogs.tsx:51,303-306`) | R1 | vitest | ⏳ kayıt: K3–K6 Mert'in 2026-09-16 kararı, `tasks/BL-038.md`'de; KARARLAR'da yok |
| 29 | Şablonun departman süzgeci "Only some departments" altında katlı durur (BL-038 K4) | R1 | vitest | ⏳ |
| 30 | Şablon satırında "Revision N" görünmez (BL-038 K5; `ScheduleTemplateDialogs.tsx:143,286`, `ScheduleTemplatesPage.tsx:183`) | R1 | vitest | ⏳ |
| 31 | Şablonu olmayan Templates yüzeyi ilk şablonu kaydetme yolunu gösterir; o yol ekranda çalışır (BL-038 K6) | R1 | vitest | ⏳ #26 ve #88'den sonra |
| 32 | Şablon uygulanınca mesaj açık vardiyaya düşen sayıyı söyler: "Standard week: 24 shifts added, 2 became open shifts." (BL-699; sunucu `converted_open_count` veriyor, kullanılmıyor) | R1 | vitest | ⏳ |
| 33 | Başkasının kilidi düşünce taslağı açan Zeynep düzenleme şeridinde "Ayşe's unsaved changes were saved as a separate draft." satırını görür; Ayşe bir dahaki açılışta aynı satırı görür (KK-162, BL-698 kalanı). Bugün yalnız kısa bildirim (`SchedulePage.tsx:299-307`) | R2 (Ayşe'nin sonradan görmesi sunucuda iz isterse R3) | vitest + e2e | ⏳ |
| 34 | Schedule'ın kendi pencereleri stil B'de: Export, Unpublish, Save draft, Review auto-fill, Review default hours, Keep editing?, Retroactive edit, Edit locked. "Keep editing?" sonucu söyler (süre dolunca işin "Auto-save" taslağına gideceğini) (BL-318, BL-715, BL-719). Ortak `ConfirmDialog` bu maddede yok (Requests C3'ün) | R1 | önce/sonra 1440 | ⏳ `styles.css` gerekirse önce koordinatör |
| 35 | Publish → Pre-flight sayımı yalnız üstte: "1 shift needs a fix before you can publish. 1 more to review."; alttaki "N blocker · N risk" kalkar (BL-441; `PublishScheduleDialog.tsx:888-904`) | R1 | vitest + önce/sonra | ⏳ |
| 36 | Publish penceresinde haftalık saat özeti ve "40+ scheduled hours" listesi (BL-121, KK-9) | R2 | vitest + önce/sonra | ⏳ yerleşim gözle (bkz. §5) |
| 37 | Save draft penceresinde başka taslağın üstüne kaydetme iki tık, menüdeki gibi (BL-708; `SaveDraftDialog.tsx:44-74`) | R1 | vitest | ⏳ |
| 38 | Onaylı izin üstündeki yayınlanmış vardiya (yalnız rızayla alınabilir) hücrede ne kırmızı ne "!" taşır (BL-579, S6; `ShiftCard.tsx:122,125`) | R1 | vitest | ⏳ |
| 39 | Aynı çakışma sorusu vardiya penceresinde ve sayfada tek cümle (BL-577; `ShiftQuickEditor.tsx:1066`, `SchedulePage.tsx:3035`) | R1 | vitest | ⏳ cümle koordinatörden |
| 40 | "Schedule published" bildirimindeki sayı değişen vardiyaları sayar, bütün yayını değil (BL-614) | R2 | API / pgTAP | ⏳ |
| 41 | Auto-fill mesajında tekil / çoğul doğru (BL-710; `SchedulePage.tsx:3397`) | R0 | vitest | ⏳ |
| 42 | Şablon mesajı emojili etiket adını yarım karakterle kesmez (BL-236; `templateApplyMessage.ts:11`) | R0 | vitest | ⏳ |
| 43 | Varsayılan saat penceresi arşivli vardiya tipini kendi adıyla gösterir, "Saved shift type" değil (BL-499; `DefaultHoursReviewDialog.tsx:92`) | R1 | vitest | ⏳ metin koordinatörden ("<ad> (archived)" önerisi) |
| 44 | Ekrana ham hata metni çıkmaz; 502 HTML cevabında da tek sade cümle (BL-395; bugün ≥19 yer: `SchedulePage.tsx` 905, 927, 968, 982, 1193, 1269-1270, 1410, 1575, 3414 + 10 dosya) | R1 | vitest + `rg` | ⏳ |
| 45 | Unpublish penceresinin metni kendi içinde çelişmez ("This cannot be undone. Republish to restore.") ve "unworked shifts" jargonu yok. YENİ (C-D15) | R1 | vitest | ⏳ |

### 2.4 Erişilebilirlik ve klavye
| # | Davranış | Sınıf | Kanıt | Durum |
|---|---|---|---|---|
| 46 | Schedule pencereleri tek kabuktan: açılınca odak pencerenin içinde, kapanınca açan düğmeye döner; Esc ve karartılmış alana tık en üstteki pencereyi kapatır (S5); arkadaki sayfanın boş-yer kuralı tetiklenmez (BL-711, BL-458, BL-608, BL-327 (3)). Bugün 9 pencere odak taşımıyor; Discard, Retroactive, Locked Esc listesinde yok | R1 (Schedule içi kanca) | vitest pencere başına + S5 testi | ⏳ |
| 47 | Düzenleme modunda ızgara tek Tab durağı, hücreler ok tuşlarıyla gezilir, okunur etiket (BL-711) | R1 | vitest | ⏳ |
| 48 | "Delete selected shifts?" penceresinde odak Cancel'dayken Enter silmez (BL-706; `SchedulePage.tsx:3456-3464`) | R1 | vitest | ⏳ |
| 49 | Hızlı düzenleyicide Delete iki tık; silme dili her yerde aynı (BL-707, BL-327 (5); `ShiftQuickEditor.tsx:1025-1036`) | R1 | vitest | ⏳ |
| 50 | Açık menü varken ızgaraya ilk tık yalnız menüyü kapatır, vardiya seçilmez (BL-617, S4) | R1 | vitest | ⏳ ölç: kod üst çubuk menüsünde ilk basışı bastırıyor görünüyor (`SchedulePage.tsx:2121-2130`), madde 10-05'te gerçek ekranda görülmüştü |
| 51 | "2 open shifts" yazısı ≥4,5:1 (bugün 3,56:1; BL-712, `styles.css:5491-5496`) | R1 | kontrast ölçümü | ⏳ |
| 52 | Lokasyon başlığındaki yayın durumu yazıyla da söylenir, açıklaması odaklanabilir (BL-713) | R1 | vitest + önce/sonra | ⏳ |
| 53 | Hafta düğmesinin erişilebilir adı görünen tarihle aynı; okuma hatasında etiket haftanın ilk gününü yazar ve bu haftada değilsen amber (BL-449, BL-451, BL-457) | R1 | vitest | ⏳ |
| 54 | Izgaranın kaydırma alanı odaklanınca görünür halka; fareyle odaklanan kart Enter / Ctrl+C'ye tepki verir (BL-610) | R1 | vitest | ⏳ |
| 55 | Çalışan yokken ızgara boş beyaz kalmaz; "No employees" görünür (BL-612, S2.3) | R1 | vitest + önce/sonra | ⏳ |
| 56 | Çalışanı okuma izni olmayan için ad tıklanır düğme gibi görünmez (BL-403) | R1 | vitest | ⏳ |
| 57 | Taslak satırında düğme içinde düğme yok; lokasyon rozeti kesilmez (BL-327 (1), (4)) | R1 | vitest | ⏳ |
| 58 | Üst çubuk denetimlerinin kenarı ≥3:1 (BL-450; S7 `#7f8c86`) | R2 | kontrast ölçümü | ⏳ Requests C3 dalı aynı token'ı değiştiriyor; o girince ölçülür |
| 59 | Kurtarma penceresi kapanınca pasif Publish'in balonu kendiliğinden açılmaz (BL-454) | R1 | tarayıcı | ⏳ ölç |
| 60 | Klavyeyle görünmeyen hücreye geçince ızgara kayıp balon açılıp kapanmaz (BL-526) | R0 | tarayıcıda bir tur | ⏳ ölç: büyük olasılıkla bayat (balon `e4231bfb` ile silindi) |

### 2.5 Görünüm ve tutarlılık (prototip cilası BL-618 ve küçükler)
Prototipten taşınacak 37 kalemin bugünkü hâli: 6 var, 8 kısmen, 19 yok, 4 ölçülmedi (A raporu Tablo 2).

| # | Davranış | Sınıf | Kanıt | Durum |
|---|---|---|---|---|
| 61 | Üst çubuk düğme ve çiplerinde hover tonu, açık menünün kenarı, 0,12 sn geçiş (S1.1–S1.5; bugün hover yalnız eylem düğmesinde, geçiş yok) | R1 | önce/sonra | ⏳ |
| 62 | Basılamayan Publish hover'da koyulaşmaz (S1.6; `styles.css:4339-4352`) | R1 | vitest | ⏳ |
| 63 | Mini takvimde odak halkası komşu günün altında kalmaz (S1.7) | R1 | önce/sonra | ⏳ |
| 64 | Vardiya kartı satırları token rengiyle (S2.1; ham `#596660`, `styles.css:11005`) | R1 | `rg` | ⏳ |
| 65 | Önemli gün balonu "Halloween" diye okunur, "event: Halloween" değil; sürükleme engel cümlesi okunur tarih ve saatle ("covers 2026-10-03 -." değil) (BL-611, S2.2, S4.5, S4.6) | R1 | vitest | ⏳ |
| 66 | Gün toplamı ekran okuyucuya okunur tarihle söylenir (S2.5; `ScheduleTotalsRow.tsx:58`) | R1 | vitest | ⏳ |
| 67 | Paste mode açıkken hücreler yeşil ve kopya imleci; etiket bildirimle üst üste binmez; kapanınca kırmızı engel mesajı temizlenir (BL-609, S3.1–S3.3; `data-paste-armed` hiç set edilmiyor) | R1 | vitest + önce/sonra | ⏳ |
| 68 | Menü ve pencereler kısa geçişle açılır; sistemde hareket azaltma açıksa geçiş yok (S3.8, S3.9, S4.8, S5.1) | R1 | önce/sonra | ⏳ |
| 69 | Sürükleme engel cümlesi "…" ile kesilir (S3.10; `styles.css:6219-6223`) | R1 | önce/sonra | ⏳ |
| 70 | Auto-fill penceresi 600 px, tarih "Tue, Oct 6" (S3.11; `AutoFillReviewOverlay.tsx:107` ham ISO) | R1 | vitest | ⏳ |
| 71 | Varsayılan saat penceresinde aralıklar düzenli, tarih okunur (S3.12) | R1 | önce/sonra | ⏳ |
| 72 | Vardiya penceresi klavyeyle açılınca da düzgün yerde açılır (bugün sol üst); 24 saatte dakika atlamaz; kural kutusunda cümle tekrarı yok; işaretli hücrede hover taramayı silmez (BL-613, S4.1–S4.4) | R1 | vitest | ⏳ dakika ve cümle kalemleri ölç |
| 73 | Seçim kutularında yazı bir boy büyür (S4.7) | R1 | önce/sonra | ⏳ ölç |
| 74 | Logo penceresinde pasif düğmeler soluk görünür (BL-615, S5.5) | R1 | önce/sonra | ⏳ |
| 75 | Odaklı kartta Enter / Ctrl+C ve Esc katmanları prototipteki gibi (S3.4–S3.7, S4.9, S5.2; kodda var) | R1 | görüntü | ⏳ yalnız kanıt (#46, #54 ile) |
| 76 | Schedule'da kalan ham renkler token'a: boş / hata kutusu, Rename hata satırı, logo Delete, sürükleme hücresinin uyarı rengi (BL-194; `styles.css:11059-11068`, `:10107-10109`, `:5851-5853`) | R1 | `rg` | ⏳ |
| 77 | Logoya fareyle tık logo penceresini açar, hafta bugüne atlamaz (BL-714) | R1 | vitest | ⏳ ölç: kodda atlama yolu bulunamadı |
| 78 | Çakışma kartı vardiya düzenleyicisinin Cancel düğmesini örtmez (BL-716) | R1 | önce/sonra | ⏳ ölç |
| 79 | Vardiya düzenleyicisinin içinde hiza ve boyut tutarlı (BL-720) | R1 | önce/sonra + ölçüm | ⏳ ölç |
| 80 | Hafta değişince "Next week" ve Settings düğmeleri yerinde kalır (BL-721; tarih kutusu sabit genişlik) | R1 | ölçüm | ⏳ |
| 81 | Yüklenirken geliştirici dili yok ("Resolving the published week." gider); geçmiş haftada taslak satırı "read-only" açıklaması taşır; mini takvimde ay dışı günler ≥4,5:1; hayalet vardiya iğnesinin adı lokasyonu söyler (BL-723) | R1 | vitest | ⏳ |
| 82 | Settings menüsünde "Role separators" (BL-655; "Seperators") | R0 | vitest | ⏳ |
| 83 | Hücredeki çakışma çizgisi oluşamayan bir durum içinse silinir (BL-522) | R1 | ölçüm | ⏳ ölç |
| 84 | Availability kapalıyken gün sütunu daralmaz, saat iki satıra bölünmez (BL-574) | R1 | ölçüm | ⏳ ölç |
| 85 | Ölü CSS silinir: `.schedule-shift-drawer` (BL-346), `.schedule-publish-action:disabled` (BL-453), Schedule telefonda kapandığı için 520 / 720 px Schedule kuralları (TEL-KAPALI artığı) | R1 | `rg` | ⏳ `styles.css`: önce koordinatör |

### 2.6 Dar pencere (768–1440 px) ve gözle karar
| # | Davranış | Sınıf | Kanıt | Durum |
|---|---|---|---|---|
| 86 | 768–1100 px'te üst çubuk binmeden ve düzenli sarar (BL-445, BL-233) | R1 | 768 / 1024 / 1280 görüntü | ⏳ gözle karar (varyant) |
| 87 | Tek lokasyonlu haftada 1440 px'te Pazar görünür; bugün Palo Alto haftasında Cumartesi kesik, Pazar kaydırmayla (BL-717; VAR B / C hazır) | R1 | 1440 görüntü | ⏳ gözle karar (varyant) |
| 88 | İki Templates yüzeyinden biri kalır: pencere ya da `/app/schedule/templates` sayfası (BL-722) | R2 | görüntü | ⏳ gözle karar |

### 2.7 Kod sağlığı ve test
| # | Davranış | Sınıf | Kanıt | Durum |
|---|---|---|---|---|
| 89 | `SchedulePage.tsx` 1500 satırın altında (bugün 3588 satır, 49 `useState`, 23 `useEffect`; BL-386) | R2 | `wc -l` + tam kapı | ⏳ |
| 90 | Izgara modeli yalnız girdisi değişince kurulur (BL-275, `SchedulePage.tsx:1875`); sıralama haritası da (BL-315) | R2 | ızgara ≤50 ms + vitest | ⏳ |
| 91 | Schedule rotalarında istek iki kez çözülmez (`schedule-routes.ts:239-255`); hafta başı hizalaması denetlenir (BL-280 Schedule kalemleri) | R2 | API testi | ⏳ |
| 92 | `schedule-data.ts`'te çağıranı olmayan fonksiyon kalmaz (BL-437 için bırakılan 9 fonksiyon + `isEditSessionStale`; BE-2 artığı) | R1 | `rg` | ⏳ #19'dan sonra |
| 93 | Unpublish penceresi yayın durumu okunamazsa yayınsız lokasyonu "0 live shifts" diye listelemez (BL-442; bugün yalnız yayındaki lokasyonlar çiziliyor, okuma düşme hâli denenmedi) | R1 | vitest | ⏳ ölç |
| 94 | e2e: sürükle-bırak (renkle), yapıştırma, toplu silme, Discard, Unpublish, şablon kaydet / uygula / Replace, Export dosyası, K17, geçmiş hafta kilidi, geçmiş vardiya penceresi, varsayılan saatler, hareketsizlik → Auto-save, düzenlerken yenileme (T-1). Var olanlar: Undo, iki müdür, canlı kanal, kilit, çok lokasyon, yayın, not, müsaitlik, onaylı takas | R0 | yeni senaryolar yerelde ve CI'da yeşil | ⏳ |
| 95 | Zayıf kilitler sağlamlaşır: "TIME OFF" hücresinin yazısı ve şekli testte (BL-525 yalnız özniteliğe bakıyor) | R0 | vitest | ⏳ |

### 2.8 Kapanış
| # | Davranış | Sınıf | Kanıt | Durum |
|---|---|---|---|---|
| 96 | Tam kapı, `test:db`, etkilenen e2e ve main CI yeşil | — | koşu numaraları | ⏳ |
| 97 | Owner ve tek lokasyon müdürü için 1440 görüntüleri, bütün pencereler; telefonda yalnız "Schedule is available on a computer." (`artifacts/EKRAN-01/`) | — | görüntüler | ⏳ |
| 98 | Izgara okuması her veri işinden sonra ≤50 ms (fixture) | — | `schedule_grid_read_budget` | ⏳ |

## 3. Bu turdan önce kapananlar (doğrulandı 2026-10-07)
Kapanış commit'lerinin hepsi `origin/main`'de; düzeltme bugünkü kodda duruyor.

| BL | Ne | Kapanış | Kilit testi |
|---|---|---|---|
| 688 | Hareketsizlikte iş "Auto-save" taslağına gider | `20339ae2` | `useScheduleEditSession.test.tsx:97` |
| 689 | Undo sunucuda da geri alır | `bb7df088` | e2e `schedule-undo.spec.ts:17` |
| 690 | Kilit geri sayımda düşmez, düşerse bir kez kurtarılır | `6501b429` | `useScheduleEditSession.test.tsx:74,238` |
| 691 | Yenilemede düzenleme geri gelir | `6501b429` | `App.test.tsx:2100,2123` |
| 692 | Bir müdürün kaydedilmemiş işi ötekinde görünmez | `57726b9a` | e2e `schedule-own-unsaved-edits.spec.ts:35` |
| 693 | Canlı kanal lokasyon başına, çekirdekte | `8fec3a7d` | `schedule_realtime_channels`, e2e `schedule-live-channels` |
| 695 | Düzenlenen taslak silinemez | `46ed4225` | `schedule_edit_session_lifecycle` |
| 696 | Şablonda mola korunur | `511aed11` | `template_replace_stays_in_its_lane` |
| 697 | Yeni vardiyaya "Live" yazmaz | `511aed11` | `template_replace_stays_in_its_lane` (e2e yok) |
| 698 | Kurtarma taslağının adı "Auto-save · ad · saat" | `12b8e9b1` | `schedule_edit_session_lifecycle`; kalan yarı #33 |
| 700 | Export yetkisi çekirdekte | `7cb8813c` | `schedule-export-v2-routes.test.ts:56` |
| 703 | Kısmi teslim kuralı kapatmaz | `efe215a4` | `schedule-export-cron.test.ts:94,182` (kayıttaki "yeniden deneme yok" notu bayat: #24) |
| 704 | Sürüklemede üç renk | `7f7e90dc` | `ScheduleRow.test.tsx:545-572` (e2e #94'te) |
| 709 | "Someone is editing" bütün görünen lokasyonlar | `fe5f1b61` | `useScheduleViewerPresenceChannels.test.tsx` |
| 159, 412 | Oturum lokasyon kapsamı; bilinmeyen ve kapsam dışı aynı cevap | `a4e0ba11` | `schedule_edit_session_scope` |
| 224 | Taslak silme kuralı çekirdekte | `20339ae2` | `schedule_edit_session_lifecycle` |
| 292 | Yükte not yoksa not korunur | `511aed11` | `shift_note_survives_every_path` |
| 326 | Taslak başka lokasyonu yayınlayamaz | `39855536` | test yok; dalda hazır (#6) |
| 391 | Ölü yayın durumu anahtarı | `2de22655` | `App.test.tsx` (BL-391) |
| 524, 525, 570 | Ad "!", TIME OFF hücresi, müsaitlik balonu | `e4231bfb` | `ScheduleEmployeeCard.test.tsx`, `ScheduleGrid.test.tsx` (zayıf: #95) |
| 545 | Kapalı gün açık düzenlemedeki vardiyayı da düşürür | `511aed11` | `closed_days_reach_the_shifts` |
| 552 → 685 | `confirm_scope` web'e ulaşır | `e986f346` | `availability-assessment.test.ts` |
| 616 | `EnterEditModeDialog` silindi | `6682304e` | — |
| 619 | "Changed after publishing" yalnız müsaitlik | `4f0a43a0`, `1154d318` | `availability_always_warns` |
| 320, 333, 573, 578, 587, 718 | Telefon kusurları; Schedule telefonda kapalı | `81aa5544`, `bdd1be43` | `App.test.tsx:1071` |
| 211 | Tek seferlik 500 | BL-316 `c2ad883a` ile aynı belirti | — |
| 376 | `schedule-routes.ts` 1462 satır (<1500) | BE-1 | `wc -l` |
| 537 | Kapanış görünümü sorgusu | bayat (DB-4 ölçümü 0,078 ms) | — |

## 4. Sıra ve bekleyenler
- **Hemen başlayabilen (koordinatör "başla" deyince):** veri hataları #11, #9 (ölç), #20, #18, #12; sonra kararı verilmiş arayüz #25–#45 (görünenler önce/sonra görüntüsüyle), erişilebilirlik #46–#60, görünüm #61–#85, test ve kod sağlığı #89–#95.
- **Requests'in veri paketini (a1a2 → a3 → a4) bekleyen:** #3–#7 (DB-4 dalı), #16, #17; yeni pgTAP dosyası `ci-green.txt` ister, paket girene kadar yeni test hücreleri var olan dosyalara eklenir ya da bekler.
- **Mert'i bekleyen:** #1 (S25, önce sohbet), #2 (S24), #86–#88 (varyant).
- **Koordinatörü bekleyen:** #10, #15, #13, #39, #43 (metin ve küçük kurallar), `styles.css` dokunuşları (#34, #85).
- **Requests C3'e bağlı:** #58.

## 5. Gözle karar bekleyenler (P04)
- **#86 dar pencerede üst çubuk** (BL-445, BL-233): 768 / 1024 / 1280 px'te 2–3 varyant.
- **#87 tek lokasyonlu haftada Pazar** (BL-717): VAR turunda B / C hazırlandı (`uygulama/VAR.md:82-84`).
- **#88 iki Templates yüzeyi** (BL-722): pencere mi, sayfa mı.
- **#36 "40+ scheduled hours"un Publish penceresindeki yeri:** metin KK-9'da var; yerleşim önce/sonra ile gösterilir.

## 6. Önerilen dışarı çıkarmalar (⏭, Mert'in onayıyla)
- **BL-334** (ortak ikon düğmesi 38 × 36, telefonda küçük) ve **BL-580** (ortak onay penceresi telefonda 8 px kayık): Schedule telefonda kapalı olduğu için Schedule'da anlamsız; ortak bileşen kusuru olarak kullanan ekranlara (Settings, Employees, Employee hub; BL-580 için Requests C3) taşınır.
- **BL-448** ("bugün" rozeti ile sütun tonu gün dönümünde ayrı günde): KARARLAR Schedule'da "bilinen sonuç" diye yazılı; düzeltme istenirse ayrı karar.
- **Hareketsizlikte kirası dolmuş, sahipsiz düzenlemenin kendiliğinden "Auto-save"e çevrilmesi** (DB-1b'de bilerek dışarıda): iş kaybolmuyor, sıradaki açılış kurtarıyor; zamanlanmış süpürücü ayrı iş.
