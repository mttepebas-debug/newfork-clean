# EKRAN-01 paket 1 + ACIL-40001: kod incelemesi bulguları (2026-10-08)

**Karar:** koordinatörde (KK, EKRAN-01-GONDERIM adım 1). Aşağıda 24 bulgu var, her birinde önerim yazılı. İlk ikisi için seçenekler ve sonuçları da var.
**İzin:** canlı için Mert'in "evet"i ya da koordinatörün G10 sonrası "gönder"i; o gelene kadar canlıya dokunulmuyor.
**Risk:** 🔴 iki bulgu (B1 veri sızıntısı yolu, B2 canlıya uygulama sırası) gönderimden önce kapanmalı. Gerisi paket içinde küçük işler ya da sonraya bırakılabilir.
**Soru:** B1'in seçimi, B3 ile B8'in paket içinde mi dışında mı kalacağı ve paket içi listenin onayı.
**Sonraki:** karar gelince düzeltmeler (her biri önce kırmızı testle), `nf-guvenlik`, tam kapı, `test:db`, Schedule e2e, canlı yedek, canlı, main.

## İnceleme nasıl yapıldı
- **Kapsam:** `task/ekran-01-40001`, main'e göre 8 commit, 20 dosya. Paket 1: #9, #11, #18, #20. ACIL-40001'in Schedule payı.
- **Yöntem** (`/code-review max`):
  1. 10 bağımsız açı ~60 aday çıkardı: satır satır, kaldırılan davranış, çağıranlar, dil tuzakları, sarmalayıcılar, yeniden kullanım, sadeleştirme, verimlilik, kök neden, kurallar.
  2. Aynı mekanizmayı söyleyenler birleştirildi; her aday ayrı bir doğrulayıcıyla sınandı (DOĞRULANDI / OLASI / ÇÜRÜTÜLDÜ).
  3. Son bir boşluk taraması yapıldı.
  - Bütün ajanlar Opus ve salt okunurdu.
- **Göç adları:** dosyalar main'in son göçü `20261008001500`'ün arkasına yeniden numaralandı (KK-220), içerik aynı. Satır numaraları yeni adlarla da geçerli:

| Madde | Yeni ad |
|---|---|
| #11 | `supabase/migrations/20261008002000_shift_edit_keeps_break_and_hidden_time.sql` |
| #20 | `supabase/migrations/20261008002100_a_failed_send_hour_counts_once.sql` |
| #18 | `supabase/migrations/20261008002200_export_rule_is_changed_by_who_reaches_it.sql` |
| ACIL | `supabase/migrations/20261008002300_schedule_conflicts_refuse_without_retry.sql` |

- **ACIL-40001'in genel düzeltmesiyle çakışma:** yok. `20261008001500_lasting_conflicts_refuse_without_retry.sql` 24 fonksiyona dokunuyor; liste benim 18 fonksiyonumla kesişmiyor. Kendi başlığında "Schedule's editing, template, auto-fill and publishing services are EKRAN-01's and stay as they are" diyor. Yöntem farkı (kopya gövde ile yerinde değişiklik) B11'de.
- **Paket 2:** main'de (`2421a830..4ef48c2b`, main CI `37642707133` yeşil).

## Taşıma (adım 1.2, kod değişmeden, 2026-10-08 ~00:31Z)
- **Yeni dallar:**
  - `task/ekran-01-v2` @`8c7ca956`: paket 1, 5 commit.
  - `task/ekran-01-40001-v2` @`0d147dda`: paket 1 + ACIL payı, 7 commit.
  - İkisi de `origin/main` @`9db64c83` üstünde. Eski dallar (`task/ekran-01`, `task/ekran-01-40001`) yedek olarak duruyor.
- **Nasıl:** commit commit aktarıldı. Göç, onu ekleyen commit'te yeniden adlandırıldı; dal içi sıra korundu (002000 → 002100 → 002200 → 002300). Göçe dokunan her commit'te şema `db:schema` ile yeniden üretildi. Ayrı şema commit'i (`f2d8bf6d`) boş kaldığı için düştü.
- **Kanıt:**
  - 4 göç dosyası eski dallardakiyle bayt bayt aynı (aynı blob).
  - Kod ve test değişikliklerinde eklenen/silinen satırlar birebir aynı: 15 dosya, +231/−42.
  - Her commit'in şema başlığı kendi göç sayısıyla eşleşiyor (441…444); `schema-snapshot check-fast` 0.
  - ACIL göçündeki 15 gövde güncel main şemasından yalnız 33 PT409 satırında ve mutate'teki #11'in 12 satırında ayrılıyor; arada geri alınacak bir değişiklik yok.
  - Bu taşıma B13'ü kapattı.

## B1 ve B2: gönderimden önce kapanmalı (seçenekli)

### B1 🔴 Kuran dışındaki düzenleyen alıcıyı değiştirebiliyor; gönderim kuranın yetkisiyle sürüyor (doğrulandı, güvenlik)

**Bugün ne oluyor:**
- Kadıköy'ün öteki müdürü Can, Ayşe'nin (ya da owner'ın) Kadıköy kuralına API'den kendi kişisel adresini koyabiliyor. Alıcıda yalnız e-posta biçimi ve 1–10 sayısı denetleniyor; üyelik aranmıyor.
- Haftalık gönderim yalnız kuranı yetkilendiriyor (`apps/api/src/schedule/schedule-export-cron.ts:231` `actorUserId: schedule.created_by`).
- Can işten çıkarılsa ya da Kadıköy'den alınsa da program (isimler, saatler) ona gitmeye devam ediyor. Owner'ın kuralı hiç kapanmıyor.
- Kuralda arşivli Beşiktaş varsa düzenleyene sorulmuyor (#18 göçü :56-62). Beşiktaş geri açılınca Can'in adresi hiç yönetmediği lokasyonun programını alıyor ve kuralı artık listesinde de göremiyor.
- Düzenleme için audit kaydı yok.
- Eskiden yalnız kuran düzenleyebildiği için Can'in kendi kuralı, erişim kaybında StoppedExport ile kapanıyordu.

**Kanıt:** #18 göçü :94 `recipients = coalesce(target_payload->'recipients', existing.recipients)`, :43-44 (`created_by` filtresi yok); `packages/shared/src/index.ts:2347`.

**Karar dayanağı:** KARARLAR:120 (BL-494, 2026-10-01) "müdür yönettiği lokasyonların kurallarını, kim kurduysa, düzenler" diyor; örneği owner'ın Ayşe'nin adresini değiştirmesi. Düzenleyen yetkisini kaybettiğinde alıcıların ne olacağı konuşulmamış.

| Seçenek | Ne olur | Sonuç | R |
|---|---|---|---|
| **A (Önerilen)** | Alıcıyı ve adı yalnız kuran ile owner/admin değiştirir. Lokasyona erişen müdür gün, saat, aç/kapa ve kendi lokasyonlarını düzenler. | Owner, izindeki Ayşe'nin adresini yine düzeltir; KARARLAR örneği korunur. Can başkasının kuralına adres ekleyemez, arşivli lokasyon yolu da kapanır. B12 de aynı kuralla kapanır. Küçük iş: update'te alan bazında bir kontrol + pgTAP. KARARLAR:120'yi daraltır; kayda tek satır gerekir. | R3 |
| B | Alıcı aktif bir workspace üyesinin adresi olmak zorunda. Cron her gönderimde alıcının üyeliğine ve kapsama bakar. | Dışarıya veri gidemez. Ama bugün muhasebeci ya da dış ortak adresine gönderimi de keser; yeni ürün kısıtı (Mert'e sorulur). Daha büyük iş: cron, şema, ekran. | R3 |
| C | Kural son düzenleyen adına gönderilir (sahiplik düzenleyene geçer); cron her hafta onu yetkilendirir. | Can erişimini kaybedince kural kapanır; owner düzenlerse owner adına gider. Ama sahiplik sessizce el değiştirir ve Ayşe'nin kuralı Can'in olur. Ürün kararı (P18). | R3 |
| D | Kod aynı kalır, yalnız audit kaydı eklenir. | Riski azaltmaz, yalnız iz bırakır. | R2 |

Önerim: **A**, paket içinde. Dayanak: ILKELER P09 (veri sessizce düşmez / yanlış kişiye gitmez), CLAUDE.md §2.A.1. C ayrıca Mert'e "kural kimin adına gönderilir" sorusu olarak gidebilir.

### B2 🔴 #11 göçü mutate'i 40001'li tam gövdeyle kuruyor; canlıya ters sırayla uygulanırsa 40001 geri gelir (olası)

**Bugün ne oluyor:**
- #11 göçü `mutate_schedule_edit_shift_service`'i 7 yerde `errcode = '40001'` ile kuruyor. ACIL göçü aynı fonksiyonu PT409 ile yeniden kuruyor. Doğru son hâl yalnız ACIL göçü #11'den sonra uygulanırsa çıkıyor.
- Sabah canlıya MCP ile dosya dosya uygularken ters sıra olursa en sık kullanılan düzenleme RPC'si yeniden 40001 atar. ~10 istekte API havuzu dolar ve API bütün kiracılarda durur.
- Depoda ters sırayı koruma testi yakalar (`schedule_edit_sessions.test.sql`), ama canlı uygulama bunu görmez. OPS-05 / KK-220 "dal içi sıra korunur" demiyor.
- Paket 1 tek başına giderse gerileme olmaz: main bugün de aynı 40001'leri taşıyor.

**Kanıt:** #11 göçü :42, :45, :57, :130, :133, :204, :213. ACIL göçü :617. Ayrıca `task/ekran-02-c2` aynı eski numaraları (`20261007200000`, `20261007220000`) taşıyordu; yeniden numaralamayla bu çakışma benim tarafımdan kalktı.

| Seçenek | Ne olur | Sonuç | R |
|---|---|---|---|
| **A (Önerilen)** | #11 göçündeki 7 errcode da PT409 (+ ipucu) yapılır. | İki göç aynı son hâli kurar, sıra önemsiz kalır. 7 satır; testler aynı. | R3 |
| B | #11 ACIL göçüne katlanır (tek göç). | mutate tek yerde kurulur, ama #11'in ayrı izi ve commit'i kaybolur. | R3 |
| C | Kod aynı kalır; gönderim adımına "dosya sırasıyla uygula; sonra mutate'in md5'ini yerelle karşılaştır" yazılır. | İnsan hatasına açık; risk prosedürle yönetilir. | R0 |

Önerim: **A + C'nin md5 kontrolü** (zaten §5 canlı adımı). Dayanak: ILKELER P19.

## Bütün bulgular

Önem: 🔴 yüksek · 🟠 orta · 🟢 düşük. "İçinde" = gönderimden önce bu pakette düzeltilmesini öneriyorum.

| No | Önem | Ne oluyor (örnek) | Kanıt | Önerilen düzeltme | Paket 1 | R |
|---|---|---|---|---|---|---|
| B1 | 🔴 | Yukarıda | #18 göçü :94 | Seçenek A | içinde | R3 |
| B2 | 🔴 | Yukarıda | #11 göçü :42 | Seçenek A + md5 | içinde | R3 |
| B3 | 🟠 | Ayşe X taslağını A sekmesinde, aynı haftanın yayınını B sekmesinde düzenliyor. A'nın heartbeat'i kilit reddi alıyor, kurtarma Ayşe'nin B'deki oturumunu kapatıyor (kayıtsız iş duyurulmayan bir Auto-save taslağına gidiyor). B de aynı yoldan kapanıyor. Eskiden 40001 askıda kaldığı için bu yol hiç çalışmıyordu. | ACIL :611; `useScheduleEditSession.ts:238`, :172-201; acquire `schema.sql` ~6352-6370, 6417-6419 | Heartbeat'te "başka açılışla kapandı" ile "süresi doldu" ayrı ipucu taşısın (`schedule.edit_session_closed`); web yalnız süre dolunca kurtarsın. | içinde önerilir (40001 bu yolu açıyor) | R3 |
| B4 | 🟠 | Laptop uyur, kilit düşer, müdür vardiya yapıştırır: ret ipucusuz geldiği için kurtarma olmaz, yapıştırma kaybolur, metin "reopen the schedule" der. Auto-fill ekrana ham "edit lease expired" yazar. | ACIL :557, :566, :1098; `SchedulePage.tsx:1962`, :987-989; `AutoFillReviewOverlay.tsx:63` | Üç rete uygun ipucu (DB, 3 satır); Auto-fill'i runWithLease içine almak (web). | ipucu içinde; web dışında (hemen ardından) | R3 / R1 |
| B5 | 🟠 | Ayşe aynı haftayı iki sekmede açar, B'de değişiklik yapar; A'da "session revision stale." banta ve toast'a ham çıkar. Şablonda aynısı, Auto-fill'de "stale auto-fill preview", yapıştırmada "Request key already used for a different batch". Oturum ancak 60 sn sonra düzelir. | `apps/web/src/schedule/schedule-data.ts:118` (isEditSessionStale çağrılmıyor); main `SchedulePage.tsx` mutate | Web bayat oturumu kodundan tanıyıp sade cümle + yeniden yükleme sunsun. | dışında (web, hemen ardından) | R1 |
| B6 | 🟠 | Molayı ve "saati gizle"yi göndermeyen bir PATCH, zod varsayılanları yüzünden 0/false yazar; #11'in "eksikse koru" kuralı API'de hiç çalışmıyor. Göç başlığındaki iddia API yolu için yanlış. Bugün web iki alanı da gönderiyor. | `packages/shared/src/index.ts:1766`, :1478-1479; #11 göçü başlık | Başlığı "yalnız SQL içi çağıranları korur" diye düzeltmek (içinde). Güncelleme şemasından `.default()`'ları kaldırmak (dışında). | başlık içinde; şema dışında | R0 / R2 |
| B7 | 🟢 | `label_ids` gönderilmeyen bir PATCH vardiyanın etiketlerini siler (eski kusur, BL-164'ten beri). #11 aynı sınıfı üç alan için kapatıyor, etiketleri bırakıyor. | ACIL :855, :874, :891 | #11'in kalıbı: anahtar yoksa mevcut etiketler korunur. | içinde önerilir (aynı fonksiyon, aynı test dosyası) | R3 |
| B8 | 🟠 | Bütün alıcıların reddettiği bir kural gönderim saati boyunca 5 dakikada bir yeniden koşar; kapanana kadar 3 yerine 25 koşu. Her koşu önizleme, dosya üretimi, ortak kuyruktan gönderim ve 5 sn bekleme demek; bozuk tek kural öteki işletmelerin gönderimini geciktirir. #20'nin yan etkisi. | #20 göçü :23; `schedule-export-cron.ts:292-304`; `schema.sql` ~13627-13636 | Aday listesine `last_failed_at`; son ~15 dakikada düşen kural atlanır. | içinde önerilir (#20 getiriyor) | R2 |
| B9 | 🟢 | Can, Ayşe'nin kuralını kendi preset'ine bağlar. Ayşe'nin e-postası Can'in ayarlarıyla gider; Can preset'ini silemez, genel "Request could not be completed" alır. Veri sızmıyor, yalnız API'den. | #18 göçü :83; `schema.sql:9181`, :32747 | `p.id = existing.preset_id or (actor = existing.created_by and p.created_by = actor)` + test | içinde (B1-A ile aynı yer) | R3 |
| B10 | 🟢 | 40001 koruma testi `raise sqlstate '40001'`, `raise serialization_failure`, `errcode := '40001'`, `errcode = 'serialization_failure'` yazılışlarını kaçırıyor. Sarmalayıcıyı taşıyan fonksiyonu da tümüyle muaf sayıyor. Bugün kaçan yok. | `schedule_edit_sessions.test.sql:279` | ACIL'in regex'ini kullanmak | içinde | R0 |
| B11 | 🟠 | ACIL göçü 33 satırı değiştirmek için 15 tam gövde kopyalıyor. Yeniden numaralanınca araya giren bir göç bu fonksiyonlardan birini değiştirmişse onu geri alır. Bugün öyle bir göç yok. ACIL v2 aynı nedenle `pg_get_functiondef` + `regexp_replace`'e geçti; üç regexp kuralı bu göçü birebir üretiyor. | ACIL göçü :13 | Göçü yerinde değişiklik biçimine çevirmek (ACIL v2 kalıbı; ~60 satır). Yapılmazsa gönderim anında 15 gövde o anki main şemasıyla yeniden karşılaştırılır. | içinde önerilir | R3 |
| B12 | 🟢 | Ad benzersizliği kuranın kurallarıyla sınırlı. Can, Ayşe'nin Kadıköy kuralını "Moda weekly" yapmayı dener, 409 alır; olmayan bir adda 200 alır. Böylece göremediği kural adlarını deneyerek bulabilir (§2.A.2). Yalnız API'den. | #18 göçü :93; `schema.sql:31019` | B1-A ile kapanır (ad değişikliği yalnız kuran ve owner/admin). | içinde (B1-A ile) | R3 |
| B13 | 🟢 | Beş ara commit eski şemayı taşıyordu (GA-1'in sütun yetkileri yerine tablo yetkisi); bir göç düzeltmesi şemasını ayrı commit'te almıştı (supabase/CLAUDE.md:5). | eski `task/ekran-01` commit'leri | Bu taşımada kapandı: her commit kendi şemasını yeniden üretti. Ayrı şema commit'i düştü. | — (kapandı) | R0 |
| B14 | 🟢 | Arşivli lokasyon testi yeni "tamamen arşivli kural" kontrolüne ulaşmıyor; Ayşe genel kapıda reddediliyor. Canlı kapsamı olan bir müdürün tamamen arşivli kuralı düzenleme ya da silme denemesi yok. | `archived_location_counts_nowhere.test.sql:144` | Kaan (Kadıköy) için düzenleme ve silme hücreleri | içinde | R0 |
| B15 | 🟢 | 20 ipucunun yalnız 2'si testte. Heartbeat'teki ipucunda bir harf hatası bütün testlerden geçer ama kilit kurtarması sessizce ölür. | `schedule_edit_sessions.test.sql:260`; `schedule_edit_session_undo.test.sql:213`, :267 | Undo ve heartbeat hücrelerinde ipucu (`pg_temp.refusal_hint` zaten var) | içinde | R0 |
| B16 | 🟢 | Pazar 21:00 gönderimi düşer, kural Pazartesi 08:00'e alınır, o da düşer. Yeni hafta ama 20 saat içinde olduğu için sayılmaz; kural 3 yerine 4. haftada kapanır. Yorum kayan pencereyi yanlış anlatıyor; testler 20 saat sınırını sınamıyor. Yalnız API'den (ekranda saat düzenleme yok). | #20 göçü :5-7, :23, :39 | Haftayı kimliğiyle saymak (cron'daki `weekStart`, ör. `last_failed_week`); B8 ile birlikte | dışında (B8 ile düşünülür) | R2 |
| B17 | 🟢 | #9 testinde "Hakan yayında değil" hücreleri hiç yayınlanmamış bir haftada, reddedilen yayından sonra bakıyor; her durumda 0. Sondaki başarılı yayından sonra "var" kontrolü yok (supabase/CLAUDE.md:37). | `excluded_person_leaves_new_drafts.test.sql:212`, :219, :223-224 | Önce taslakta varlık, sonda `published_for = 1` | içinde | R0 |
| B18 | 🟢 | API'deki çakışma haritası, `reason`'ın zaten taşıdığını ikinci bir sözlüğe (`code`) çeviriyor; :1440-1441'deki yorum bayat. | `apps/api/src/schedule/schedule-routes.ts:1428-1431`, :1452 | Web'in `reason`'dan okuması (5 test değişir) | dışında | R2 |
| B19 | 🟢 | mutate'te aynı satır üç kez okunuyor (normalize, kept, prepare). | ACIL :746, :756-757, :802 | Tek okuma (`case when kept.id is null then null else to_jsonb(kept) end`) | dışında (performans küçük) | R3 |
| B20 | 🟢 | #18'de "bir yerde" kapısı artık gereksiz, eklenen lokasyonlar iki kez hesaplanıyor, `coalesce` ölü. | #18 göçü :34-35, :129-130, :59-68 | Temizlik; kapıyı kaldırmak `schedule_asks_the_core` eşiğini düşürür | dışında | R3 |
| B21 | 🟢 | save'deki `serialization_failure → PT409` yakalayıcısı artık ölü kod. | ACIL :1498; test yorumu `schedule_edit_sessions.test.sql:276-277` | Silmek (B11 yapılırsa regexp ile) | dışında | R3 |
| B22 | 🟢 | #18 göçünün yorumunda Türkçe: "kullanıcı kararı" (CLAUDE.md §3.1). | #18 göçü :1 | "user decision" | içinde | R0 |
| B23 | 🟢 | `preview_schedule_default_hours_service` "Edit session not found" için ipucusuz 42501 (eski; sayılan borç BL-276). | ACIL :1096 | `authz.out_of_scope` ipucu | dışında | R3 |
| B24 | 🟢 | Testlerde aynı üç satırlık çağrı 14 kez tekrar. | `schedule_one_function_per_job.test.sql:189-234`; `archived_location_counts_nowhere.test.sql:144-152` | `pg_temp.rule_as` yardımcısı | dışında | R0 |

Çürütülen: "`add column last_failed_at` `if not exists` taşımıyor; yeniden numaralanınca 42701". Göç hiçbir veritabanında eski numarayla uygulanmadı (yerelde de canlıda da yok), bu yüzden hata doğmaz.

## Önerdiğim paket içi liste (koordinatör onayına)
- **Önce:** B1-A (+B9, B12), B2-A, B3, B4-ipucu, B6-başlık, B7, B8, B11.
- **Testler:** B10, B14, B15, B17. Metin: B22.
- **Sonraya (backlog):** B4-web, B5, B6-şema, B16, B18–B21, B23, B24.
- **Kapandı:** B13.
- **Tahmini iş:** DB tarafı ~1 göç düzeltmesi + 1 yeniden yazım (B11) + 1 cron değişikliği; testler var olan dosyalara hücre.
- **Sonra:** `nf-guvenlik` yeniden bakış, tam kapı, `test:db`, Schedule e2e.
