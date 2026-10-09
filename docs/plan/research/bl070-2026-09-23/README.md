# BL-070 derin araştırma — 2026-09-23

**Durum:** araştırma bitti, bulgular kaydedildi. **Kararlar verilmedi.** Kullanıcı önce konuyu (özellikle rol/kapsam modelini) konuşmak istiyor; sonra bu bulgulara dönülecek ve 1–38 yeniden karara bağlanacak.

**Ne:** 38 kırmızı pgTAP test dosyasının her biri için "eski kod → yeni kod değişikliği mantık olarak doğru mu, uygulamayı istenmeyen yöne mi sürüklüyor" araştırması. Ölçüt koddaki yapı değil, kullanıcının tarif ettiği **hedef model** (bkz. `BRIEF.md`).

**Taban:** main `41783c7`, yerel DB 319/319 migration, tam pgTAP koşusu: 131 dosya / 3741 kontrol / **38 kırmızı** (`baseline-kirmizi-38.txt`, 22 Eylül ölçümüyle birebir aynı liste).

**Yöntem:** 8 paralel ajan (Opus), hepsi aynı brief. 7'si dosya alanlarını, biri (G) kapsam modelini araştırdı. Denemeler tek transaction + rollback (bir istisna: aşağıda "Kaza"). Kritik iddiaların bir kısmı ayrıca yeniden ölçüldü (aşağıda "doğrulama" sütunu).

## Dosyalar

| Dosya | İçerik |
|---|---|
| `BRIEF.md` | Ajanlara verilen hedef model, kurallar, rapor şablonu. **Kullanıcının uygulama tarifi burada** (roller, availability, time off, takas kuralları) |
| `A-roller-guvenlik.md` | 1–6 |
| `B-belgeler-onboarding.md` | 7–11 |
| `C-bildirimler.md` | 12–15 |
| `D1-musaitlik-atama.md` | 16–19 |
| `D2-musaitlik-diger.md` | 20–23 |
| `E-schedule-yazma.md` | 24–28 |
| `F-takas-talepler.md` | 29–31 |
| `G-kapsam-modeli.md` | Çok lokasyonlu senaryolar (20), 4 aday model, sektör karşılaştırması, öneri |
| `onceki-kararlar-sohbet.md` | Araştırmadan ÖNCE sohbette verilen kararlar (hedef model tam anlatılmadan; hepsi yeniden değerlendirilecek) |
| `deneyler/` | Ajanların geri alınan deneme betikleri (kanıt; `\i /tmp/...` kullananlar konteynerdeki kopyaya bağlı) |

## Numaralandırma ve ajan önerileri

"Sohbet no" = araştırmadan önceki sohbette kullanılan "Dosya N". Öneriler ajanlarındır; kullanıcı kararı bekliyor.

| No | Test dosyası | Sohbet no | Ajan önerisi (kısa) | Önceki sohbet kararıyla fark |
|---|---|---|---|---|
| 1 | function_execute_privileges | 1 | Repo: Roles okuması API'ye | aynı |
| 2 | tenant_owned_composite_foreign_keys | 2 | Repo: **11 FK'nin hepsi**, istisna yok (çapraz workspace bağı bugün kabul ediliyor — denendi) | **değişti** (önce 8+3 istisna) |
| 3 | onboarding_composite_tenant_constraints | 6 | Test (geçerli hafta); #7 BL-091'e bağlı | ek koşul |
| 4 | roles_permissions_rls | 12 | İkisi + ürün kararı; yönetici işten çıkaramıyor (14 Eylül regresyonu); yeşil kontroller D1/D2 ile çelişiyor | kapsam modeline bağlandı |
| 5 | scheduling_settings_shift_types_rls | 11 | Test | aynı |
| 6 | weekly_team_availability | 13 | #23 repo, #24 test | aynı |
| 7 | bl052_document_access | 3 | Test | aynı |
| 8 | bl052_document_definitions | 4 | Test (+ düzenlemeden önce taslağa çek) | ek |
| 9 | bl052_document_employee_assignment_preview | 5 | Test | aynı |
| 10 | employee_onboarding_rls | — | İkisi: test (65/65 ile denendi) + eski yükleme/indirme yolu silinsin | yeni |
| 11 | weekly_onboarding_preferences | 19 | İkisi: test + çalışan "Start over" kalıntıları silinsin | aynı |
| 12 | notification_platform_core | 7 | Test (#13 sil) | ayrıntı değişti |
| 13 | notification_settings_admin | 8 | Test (ekranın gerçek davranışı) | ayrıntı değişti |
| 14 | notification_preference_resolver_and_producers | 9 | İkisi | ayrıntı |
| 15 | account_notification_scope | 10 | Repo — ama **asıl sebep alıcı listesi yok**; şablon eklemek yetmez | **değişti** |
| 16 | schedule_availability_enforcement | — | Test: çoğu silinsin, "Block" kontrolleri yeni sisteme taşınsın | yeni |
| 17 | availability_shift_type_restrictions | — | Dosya silinsin (kaldırılmış özellikler) | yeni |
| 18 | availability_draft_impact_review | — | Dosya silinsin | yeni |
| 19 | availability_read_model_consistency | — | İkisi: Schedule ızgarası eski sistemi okuyor | yeni |
| 20 | schedule_default_hours_review | — | Test | yeni |
| 21 | schedule_custom_service_classification | — | Test silinsin + "custom work" kutusu kod temizliği | yeni |
| 22 | availability_review_lifecycle | — | Ürün kararı (availability onayı yok mu?) sonra sil | yeni |
| 23 | employee_hub | — | İkisi | yeni |
| 24 | weekly_schedule_batch | 18 | Test (28/28 ile denendi) | aynı |
| 25 | weekly_shift_availability_assessment | 20 | #7/#18 test, #4 test+mesaj, #3 ürün kararı (saatsiz vardiya durumu silinsin) | **#3 değişti** |
| 26 | schedule_time_source | 21 | #25/#3 ile aynı kök; saatsiz senaryolar silinsin | **değişti** |
| 27 | weekly_assignment_candidates | 14 | #19 repo (BL-092 kökü), #5 test+mesaj | #19 artık repo |
| 28 | schedule_publication | — | Test (41/41); BL-096 "bayat önizleme" gerçek hata değil | yeni |
| 29 | weekly_exchange_changed_terms | — | Test + ürün kararı (değişen şartlarda kabul korunsun mu) | yeni |
| 30 | shift_exchange_travel_policy | — | Repo: bırakılan vardiya dışlanmıyor → swap'lar reddediliyor | yeni |
| 31 | schedule_requests | — | Ürün kararı: eski Requests takas akışı sökülsün mü | yeni |
| 32–38 | lineup_operations_v1, schedule_lineup, weekly_lineup_offer_changed_terms, weekly_lineup_remaining_offer_terms, weekly_lineup_retained_segments, weekly_lineup_transfer_acceptance, weekly_exchange_acceptance | 15–17 | **Beklemede** — Line Up sadeleştirilecek (kullanıcı kararı); weekly_exchange_acceptance'ın tek kırmızısı Line Up kontrolü | — |

## En ağır bulgular (doğrulama seviyesiyle)

| Bulgu | Doğrulama | İşaret |
|---|---|---|
| Admin, yöneticinin plan oturumunu devralıp aynı taslağa kaydedince taslaktaki başka lokasyon vardiyası sessizce siliniyor (plan kilidi workspace+hafta başına tek; `schedule_edit_sessions_active_week_idx`) | Orkestratör yeniden koştu (G/exp5) | critical / moderate |
| Owner, yalnız Kadıköy içeren bir yönetici taslağını Beşiktaş için de yayınlarsa Beşiktaş'ın yayınlı vardiyaları siliniyor, önizleme "ready" | **Doğrulanmadı** (E/x7; yeniden koşu FX kalıntısı yüzünden başarısız) | — |
| Çalışan kartını kaydetmek onaylı tercih edilen adı siliyor (`save_employee_service` `''` geçiyor; `20260922010000_names_have_three_parts`) | Kodla doğrulandı | high / safe |
| Takas/cover/release hiçbir ekrandan yapılamıyor: `workspaces.shift_exchanges_enabled` her yerde false, açan ekran/API yok | Doğrulandı | high |
| Owner/admin/manager çalışan arayüzüne giremiyor (`App.tsx` employee-hub rotası `roles={["employee"]}`) | Doğrulandı | high |
| Yönetici hesabı olan çalışanı işten çıkaramıyor/arşivleyemiyor (14 Eylül sahiplik devri migration'ı izni düşürmüş) | Ajan A denemesi | high |
| Schedule ızgarası eski availability sistemini okuyor, kaydetme/yayın yenisini (`100c882`, 10 Eylül, gerekçesiz) | Commit doğrulandı | high |
| Onaylı izin Settings → Conflict handling'den "Require confirmation"a çekilebiliyor; hedef "her zaman hard" | 3 ajan ölçtü | high |
| Tercih edilen ad bildirimleri kimseye ulaşmıyor (alıcı listesi yok), onay lokasyona bakmıyor, kişi kendi talebini onaylayabiliyor | Kodla doğrulandı | high |
| Swap'ta bırakılan vardiya kendisiyle çakışıyor sayılıyor (BL-092 kökü, BL-064/15 Eylül) | Ajan E+F ölçtü | high / moderate |

## Önce konuşulacak temel sorular (kararların çoğu bunlara bağlı)

1. **Kapsam modeli** (G): M2 "kişi ortak, vardiya yerel" (öneri) / M3 / M4 / M1. Kullanıcı "kusursuz plan yoksa hiyerarşiyi değiştirmeye açığım" dedi; G kusursuz planın M2 ile mümkün olduğunu savunuyor.
2. **BL-091:** yeni availability sistemi esas, eski sistem ızgara okuması dahil sökülsün mü?
3. **Takas sistemi:** Shift Hub mı, eski Requests → Shift changes akışı mı?
4. **Owner/admin/manager'ın kendi vardiya/izin/takas işleri:** Employee Hub'a erişim mi, admin arayüzüne "Benim vardiyalarım" mı?
5. **Onaylı izin ve availability ayarları:** "Approved time off → Require confirmation" ve "Employee availability → Allow" kaldırılsın mı?
6. Her ajan raporunun sonunda alanına özgü sorular var (önem sırasıyla).

## Sohbetteki önceki iddialardan düzeltilenler

- Tercih edilen ad bildirimi için "şablon + producer ekle" yetmez; asıl sebep alıcı listesinin olmaması (C).
- 11 FK'nin 3'ü "başka yoldan korunuyor" değil; 11'i de düzeltilmeli (A).
- BL-091'deki "yöneticinin 'yine de koy' onayı yayının okuduğu yere yazılmıyor" iddiası yanlış (D1).
- "Eski sistemi 23 yer okuyor": uygulamanın çağırdığı canlı okuyucu 4 (D2) — iş daha küçük.
- "Taslak belgeyi 3 yol süzmüyor": yalnız onboarding başlatma süzmüyor; sıra önemli (önce başlatma süzsün, sonra kapı hata versin) yoksa davet kabulü çöker (B).
- "Saati bilinmeyen vardiya → verification_required" kararı tek başına çalışmıyor; saatsiz vardiya durumu artık oluşturulamıyor, silinmesi önerildi (E).

## Kaza: yerel ortak DB'de kalıntı (TEMİZLİK BEKLİYOR)

Ajan E'nin bir denemesi geri alınmadı. Yerel DB'de **"FX" workspace'i** (`e0000000-0000-4000-8000-000000000001`, ~230 satır: 4 membership, 2 lokasyon, 2 employee, 1 yayınlı vardiya, 202 rol izni vb.) ve **4 auth kullanıcısı** (`fx-*@example.test`) kaldı. Kendi içinde kapalı; Meyhouse/seed verisine bağlı değil. Kullanıcı kararı bekleniyor: yedekleyip yalnız bunları silmek (öneri) ya da bir sonraki DB yeniden kurulumuna bırakmak. Temizlikten sonra E/x7 (yayında Beşiktaş silinmesi) yeniden doğrulanmalı.

## Kapsam dışı / bekleyen

- Line Up (32–38): sadeleştirme kararı bekliyor.
- G'nin sektör karşılaştırmasındaki kaynaklar orkestratör tarafından doğrulanmadı.
- Raporların tek sayfalık okunur versiyonu (artifact) yapılmadı; kullanıcı önce konuşmak istedi.
