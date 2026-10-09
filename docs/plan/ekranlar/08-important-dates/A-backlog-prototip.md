# A — Important Dates: açık backlog, prototip farkları, kodda olmayan kurallar (EKRAN-08, 2026-10-06, `20332d46`)

## Özet
- **Ölçüm:**
  - `origin/main` `20332d46` (2026-10-06 11:06 PDT). Worktree `newfork-wt/plan-e08` aynı noktada.
  - Yerel DB'nin son migration'ı `20261007130000`. Bu, main'deki son dosyayla aynı.
  - Yerel DB'de yalnız SELECT çalıştı (`set default_transaction_read_only = on`). Test koşulmadı, dev sunucusu açılmadı, dosya yazılmadı.
  - Ekranın dosyaları gece tazeliğinden (`44e41a54`) bu yana değişmedi (`git log 44e41a54..origin/main` boş). Değişmeyen dosyalar: `ImportantDatesSettingsPage.tsx`, `important-dates-routes.ts`, `important-dates-service.ts`, `organization-data.ts`.
- **Son BL numarası:** BL-878 (`origin/main` `20332d46`).
- **Sayılar:**
  - Ekranın içinde 14 açık backlog kaydı var: 11'i geçerli, 2'si değişmiş, 1'i ölçülmedi. Bayat madde yok.
  - YENİ bulgu: içeride 7, sınırda 1.
  - Sınırda: 13 madde.
  - Prototip (P4 Important Dates + PHONE-MGR2): 14 madde "taşı", 3 "bırak", 2 "soru".
- **En ağır bulgu: yayınlanmış vardiyası olan bir güne kapalı gün kaydedilemiyor. Aynı türden bir kapalı gün de yeniden yayınlanamıyor.**
  - Sunucu 2026-10-02'den beri (`af0bcb96`) bir şart koyuyor: kapalı günün düştüğü vardiyalar ekranda listelenmeli ve "gördüm" parmak izi gönderilmeli (K13). Parmak izi yoksa kaydı reddediyor.
  - Ekran bu listeyi hiç çağırmıyor. Kayıt ret alıyor, pencerede "Review the shifts on this closed day again." yazıyor. Gözden geçirilecek bir liste yok, kişi çıkmazda kalıyor.
  - Örnek: Kadıköy müdürü Ayşe 14 Ekim Çarşamba'yı Kadıköy için kapatmak ister. O gün Ali'nin ve Emre'nin yayınlanmış vardiyası var. "Save date"e basar, hata satırını görür, hiçbir şekilde kaydedemez.
  - Veri katmanı (`previewImportantDateClosure`), API ucu (`/closure-preview`) ve sunucu hazır. Ekran parçası yalnız eski dalda (`task/fb-6.7-ui`).
- **Eski dal:** `task/fb-6.7-ui` (@`4d9226cc`, 16 commit). Ayrıldığı noktadan (`3ec4985c`, 2026-10-03) bu yana main 314 commit ilerledi. Worktree'si (`newfork-wt/fb-6.7-ui`) hâlâ açık.
  - Önemli tarih parçaları bugün de değerli: kapalı gün vardiya listesi, History sekmesi, geçmiş tarihin salt okunur penceresi, kapalı gün sonuç satırları ve bunları sınayan e2e.
  - Ama dal DOC-TABLE'dan önce yazıldı. "Show archived" anahtarı, beyaz "Add date" düğmesi ve eski satır etiketleri bugünkü kararlarla çelişiyor. Bu yüzden dal birleştirilmez; mantığı bugünkü dosyaya taşınır (bölüm 4).
- **Kapı:** önemli tarihin davranış konuşması (Başlık 3) hiç yapılmadı. Mert 2026-10-04'te B + C'nin (C = kapalı gün) davranışını uygulamadan önce senaryo senaryo konuşmak istemişti (KARARLAR:553, ILKELER P18). Soru S1.

## Ekranın sınırı
- **İçeride:**
  - **Sol menü → Important Dates** (`/app/important-dates`, `App.tsx:398-405`; menü `AppShell.tsx:113-119`, owner / admin / müdür).
    - Bu sayfa artık Settings'in altında değil. Eski `/app/settings/important-dates`, `/closed-days` ve `/important-dates/closed-days` adresleri buraya yönleniyor (`App.tsx:538-548`).
    - Listede sekmeler, süzgeçler, sıralama ve satır menüsü var.
  - Önemli tarih penceresi: yeni / düzenle, Archive, Unpublish / Republish / Restore. Hedefte Details / History sekmeleri olacak (B3-A).
  - "Closed day" kaydedilirken çıkan etki listesi (K13, C1-B), sonuç satırları (K15, K16) ve geçmiş kilidi (K11).
  - Veri tarafında şu servisler: `read_settings_important_dates_service`, `save_important_date_service`, `set_important_date_state_service`, `read_important_date_history_service`, `preview_important_date_closure_service`. Bunlara `app_private.important_date_*` yardımcıları (17 fonksiyon) eşlik ediyor.
  - Sayfalama (25 / 50 / 100).
- **Sınırda:**
  - Schedule'daki kapalı gün çakışması ve gün başlığı işareti (EKRAN-01: BL-701, BL-238, BL-762 (3));
  - Announcements (EKRAN-07);
  - Notifications'taki önemli tarih ve "vardiyan kaldırıldı" bildirimi (ekran 9; K5, K7, K14);
  - Settings → Conflict handling → Closed location (C2-A);
  - ortak bileşenler (EKRAN-02 C3).

Teknik adlar, birer satırda:
- **Kapalı gün etki listesi (K13):** kapalı gün kaydedilirken o günün yayınlanmış vardiyaları. Her birinde "Open shift" ya da "Keep" seçilir.
- **Parmak izi:** sunucunun "kişi bu listeyi gördü" kanıtı. Liste kayıt anında değiştiyse kayıt reddedilir.
- **Kilit çizgisi (K11):** Schedule'ın düzenlenebilen ilk haftasının başı. Bundan önce biten tek seferlik tarih herkese salt okunurdur.
- **History (B3-A):** pencerede kimin, ne zaman, neyi neye çevirdiğinin listesi.

## 1. Açık backlog maddeleri (tazelik hükmüyle)

### İçeride
- **BL-676 (leave: medium / do: safe) Geçmiş önemli tarihin satırı kapalı. Tazelik 2026-10-06 (`20332d46`): değişmiş, kapsam büyük.**
  - Satır düğmesi `disabled={!mayManageDate(item)}` (`ImportantDatesSettingsPage.tsx:654`). `mayManageDate` = `can_edit === true` (`:98`).
  - Bu yalnız geçmiş tarihleri kilitlemiyor. Kişinin düzenleyemediği her satır kapanıyor.
    - Örnek: owner Zeynep'in Kadıköy'e açtığı "Inventory day" (K2) Ayşe'nin Upcoming listesinde tıklanmıyor. Ayşe notunu okuyamıyor.
  - Kapalı satırlar ayrıca soluk çiziliyor: `.jobs-settings-page button:disabled { opacity: .45 }` (`jobs-settings.css:42-46`). Soluk kaldırma yalnız arşivli satırlara yapılmış (`list-page.css:254-261`). Ayşe kilitli satırların adını ≈2.4–2.9:1 kontrastta görüyor (gerek 4.5:1).
  - Sunucu pencereyi okumaya açmak için gereken bilgiyi gönderiyor (`is_past`, `locked_before`; canlı gövde `read_settings_important_dates_service:21, 30`). Dal bunu yapıyor: salt okunur pencere, "Close" düğmesi, "This date has passed. Past dates are read-only." Ama dal yalnız geçmiş tarihi açıyor; K2 yüzünden kilitli satırı açmıyor.
  - Önerilen yeni metin: "Düzenleyemediğim her önemli tarih (geçmiş ya da üst rütbenin kaydı) satırda kapalı ve soluk. Pencere salt okunur açılmalı, satır tam renkte durmalı."

- **BL-679 (leave: low / do: safe) Yıllık tarih bu yılki günü geçince Past'a düşüyor. Tazelik: geçerli, karar bekliyor.**
  - `dateTab` yalnız `ends_on < today`'e bakıyor (`:764-767`).
  - Sunucu yıllık tarihi hiç "geçmiş" saymıyor: `important_date_is_past` = `recurrence = 'none' and ends_on < line` (canlı gövde satır 7).
  - Sonuç: yıllık Labor Day Past sekmesinde duruyor ama satırı düzenlenebilir.
  - Soru S2.

- **BL-595, Important Dates kısmı (leave: medium / do: safe) Archive tek tık; pencerede "Delete date" aslında arşivliyor. Tazelik: geçerli.**
  - Satır menüsü `:718-732`, `ConfirmButton` yok.
  - Pencere `:769-828`: "Delete date" → "Delete "<ad>"?" → "This date will be archived…" → "Delete date".
  - Dayanak: B1 (adı "Archive", iki tık kırmızı, "Confirm archive"); P4 DL11, DW13 aynı kararı uyguluyor.
  - Dal da bunu düzeltmiyor: penceresi "Delete date", satırı tek tık.

- **BL-605, Important Dates kısmı (leave: low / do: safe). Tazelik: değişmiş.** Archived sekmesi düzeldi (`list-page.css:254-261`). Kilitli satırlar (Past ve K2) hâlâ 0.45 soluklukta. Ayrıntı BL-676'da; burada ayrı iş gerekmez.

- **BL-598 (leave: low / do: safe) Telefonda "IMPOR…" kesilmesi. Tazelik: kod geçerli, piksel ölçülmedi.**
  - Etiket `:611`. Telefon ızgarası `minmax(0,1fr) 110px 32px` (`jobs-settings.css:2111-2113`).
  - Kart satırı gelince (BL-599) kendiliğinden kapanır.

- **BL-599, Important Dates kısmı (leave: medium / do: moderate) Telefonda kart satırı yok. Tazelik: geçerli.**
  - 720 px altında hâlâ ızgara: başlık + tarih + menü. Tür, lokasyon ve etki gizli (`jobs-settings.css:2110-2117`). Tür ve lokasyon yalnız `job-mobile-meta` satırında görünüyor (`:664-666`), etki çipleri telefonda hiç yok.
  - Karar (Mert, 2026-10-05) Important Dates'i adıyla sayıyor (KARARLAR:311). Prototip PHONE-MGR2:23'teki düzen: ad, altında tarih · tür · lokasyon, üçüncü satırda etkiler.

- **BL-787, Important Dates kısmı (leave: medium / do: safe) Sayfalama yok. Tazelik: geçerli.**
  - Sayfada pagination yok. `read_settings_important_dates_service` bütün tarihleri tek seferde döndürüyor (canlı gövde 22-51, `limit` yok).
  - Önerim: istemcide sayfalama yeterli (tarih sayısı küçük). Yol Announcements ve Settings → Documents ile aynı (P19, KK-182 K6).

- **BL-544 (leave: low / do: moderate) Kapalı gün ile onaylı izin, vardiya düşürme adımlarını iki ayrı yerde yazıyor. Tazelik: geçerli.**
  - `important_date_close_shifts` son tanımı `20261007120000:556`. Ortak adımları yalnız yorumda anıyor (`:624`, "ponytail: the same steps … `time_off_release_shifts`").
  - Aradaki fark: DB-1c Undo bariyeri (`:619`) yalnız kapalı gün yolunda.

- **BL-546 (leave: low / do: safe) Yıllık çok günlü tarih kendi günleri sürerken düzenlenirse o yılın tekrarı eski kayıtta kalır. Tazelik: geçerli.** Kod bunu bilerek kabul ediyor (`20261005000000:134-135` "ponytail").

- **BL-547 (leave: low / do: safe) K11 ile ayrılan geçmiş kopyanın History'de kaydı yok. Tazelik: geçerli.**
  - Canlı `important_date_keep_past` yalnız `insert into public.important_dates` yapıyor (satır 16, 30). `important_date_changes`'a yazmıyor.
  - History sekmesi gelince (YENİ-3) görünür hâle gelir.

- **BL-548 (leave: low / do: moderate) Kapalı gün listesinde saat dilimi karışık. Tazelik: geçerli.**
  - Canlı `important_date_closure_impact` satır 27 `coalesce(shift.time_timezone, location.timezone)`.
  - Son tanım `20261007090000:789`.

- **BL-549 (leave: medium / do: moderate) Arşivden dönen lokasyonda kapalı gün listesiz uygulanıyor. Tazelik: ölçülmedi (kısmi).**
  - Lokasyon geri alma yolu tetikleyici `locations_reach_the_owner_on_restore`.
  - Kapalı gün o lokasyona `closure_days` görünümünden dönüyor (`location.archived_at is null`, canlı satır 13).
  - Vardiya düşüyor mu, yoksa yalnız çakışma mı geri geliyor, ölçmedim. Lokasyon geri almayı ekranda denemek gerekiyor. Settings → Locations turunun işi.

- **BL-550 (leave: low / do: safe) Değişmeyen kayıt da sürüm artırıyor ve History satırı yazıyor. Tazelik: geçerli.** Canlı `save_important_date_service`: `revision = revision + 1` koşulsuz (satır 122), history `insert` koşulsuz (`:157-161`).

- **BL-551 (leave: low / do: safe) `important_date_shift_releases`'in üç yabancı anahtarı indekssiz. Tazelik: geçerli.** `pg_indexes`: yalnız `pkey` ve `date_idx (important_date_id)`.

## 2. Prototip farkları (taşı / bırak / soru)
Kaynak: `newfork-prototype/proto-audit/P4.md` ("Important Dates list" DL1–DL17, "Important date window" DW1–DW24, D2–D4, D9) ve `PHONE-MGR2.md:14, 23-25`.
- `KANONIK.md` okundu; prototipe yazılmadı.
- P4'ün "matched" dediklerinden 6'sını main'de yokladım: DL2, DL5, DL8, DL10, DW5, DW6. Hepsi doğru.
- P4 `4d3936d1`'de ölçülmüş; satır numaraları bugün de aynı, çünkü dosya o tarihten beri değişmedi.

### Taşı (kararı yazılı)
| P4 / kaynak | Ne | Dayanak |
|---|---|---|
| DW15, DL13 | Kapalı gün yayınlanmış vardiyaları pencerede listeler; her birinde Open shift / Keep; tek düğme "Save · N shifts to open". Kapalı günü yeniden yayınlamak önce bu listeyi açar | K13, C1-B (YENİ-1) |
| DW16 | Taslak haftada tek satır: "N shifts in the draft move to open shifts." | K16 (YENİ-2) |
| DW17, DL16 | Kapalı gün arşivlenince, yayından kaldırılınca ya da değiştirilince "Closed day archived. 3 shifts stay open." | K15 (YENİ-2). Dalın açığı D9: Unpublish'te satır yok; taşırken eklenir |
| DW14 | Details / History sekmeleri; en yeni üstte, eski → yeni; görülmeyen değişiklik "Hidden change" | B3-A, K2 (YENİ-3) |
| DL14, DW18 | Geçmiş tarih salt okunur pencerede açılır; yalnız "Close", satır menüsü yok | K11 (BL-676) |
| DW12 | Tek seferlik tarihte kilit çizgisinden önceki gün seçilemez: "Past dates are read-only. Pick Sep 28, 2026 or later." | K11 (YENİ-4) |
| DL11, DW13 | Archive iki tık kırmızı, "Confirm archive"; "Delete" adı kalkar | B1 (BL-595) |
| DL15 (zemin + düğme) | Boş hâlde açık zemin, yeşil daire içinde takvim, yeşil "New date" | KARARLAR:557 + Son hâl + LIST-YESIL (YENİ-5) |
| E-X2 | Başlık satırında beş sütun adı aynı ölçüde (11 px) | KARARLAR "Başlık satırı" (YENİ-7) |
| PHONE-MGR2:23 | Telefonda kart satırı: ad / tarih · tür · lokasyon / etkiler | KARARLAR:311 (BL-599) |
| PHONE-MGR2:14 | Telefonda başlık 28, yan boşluk 16, sekme satırı sabit y | KARARLAR:298 + BL-599 |
| PHONE-MGR2:25 | Telefonda pencere tam ekran | zaten öyle (matched); yalnız ölçüm görsel QA'ya |
| DL12 | Restore Unpublished getirir, bildirim yok | sunucu zaten böyle (`set_important_date_state_service:55`); doğrulama yeter |
| D9 | Kapalı gün Unpublish edilince de "N shifts stay open" | K15 (dal bunu atlıyor) |

### Bırak
- **DW24:** prototip vardiyaları Schedule'ın derleme anındaki kopyasından okuyor. Gerçek uygulama canlı okuyor; prototipin sınırı.
- **DW20–DW23:** prototip sunucu hatası, "Saving" ve arşivli lokasyon hâlini çizemedi. Gerçek uygulamada bunlar zaten var.
- **DL17:** prototipin tohum satırı kuralı; gerçek uygulamayla ilgisi yok.

### Soru
- **D4 / BL-679:** yıllık tarih hangi sekmede dursun? Soru S2.
- **History satırının biçimi:**
  - Dal: "Changed · Burak Barkoren · Sep 20, 3:40 PM" (yılsız, "by" yok).
  - Duyurunun C1 kararı: "Unpublished by KadıköyMüdür1 · Oct 4, 2026 · 9:20 AM".
  - İki zaman çizelgesi ayrı biçimde kalırsa aynı işlevde iki dil olur (CLAUDE.md §9). Ortak değer olduğu için koordinatöre (K3).

## 3. KARARLAR'da olup kodda olmayan kurallar
Ölçü: canlı gövdeler (yerel DB, `pg_get_functiondef`), `ImportantDatesSettingsPage.tsx` ve `organization-data.ts`. Ürün kuralları K1–K18'in önemli tarihe uygulanan kısımları "Başlık 3 konuşulana kadar aynen sürer" diye duruyor (KARARLAR K3, K4, K5, K8 ekleri). Ben de onları ölçü aldım; duyuruya sonradan gelen değişiklikleri almadım.

| Kural | Bugün kodda | Kanıt | Önem |
|---|---|---|---|
| **K13 kapalı gün yayınlanmış vardiyaları listeler, Open shift / Keep** | Sunucu, API ve veri katmanı hazır. Ekran listeyi çağırmıyor, kayıt reddediliyor | `save_…_service:87-93`, `set_…_state_service:39-45` (`closure_changed`); `organization-data.ts:421-432` ve `:486-492` hiçbir ekranda kullanılmıyor (`grep -rln` yalnız tanım dosyası) | **yüksek** (YENİ-1) |
| **K15 kaldırılınca "N shifts stay open" yazılır** | Sunucu `shifts_stay_open` döndürüyor, ekran okumuyor; arşiv ve Unpublish sessiz | `set_…_state_service:94`; sayfa `:128-133` yalnız `refresh` | orta (YENİ-2) |
| **K16 taslakta tek bilgi satırı** | Sunucu `draft_shifts_opened` döndürüyor; ekranda satır yok | `save_…_service:166` | düşük (YENİ-2) |
| **B3-A / K2 değişiklik geçmişi görünür** | Sunucu ve API'de var, ekranda sekme yok | `read_important_date_history_service`, `important-dates-routes.ts:100-110` | orta (YENİ-3) |
| **K11 geçmiş tarih salt okunur (kapalı değil); kilit çizgisinden önce gün seçilmez** | Satır kapalı; formda alt sınır yok; ret cümlesi çizgiyi söylemiyor ("Past important dates are read-only.") | `:654`, `:473-501`; `20261005000000:126` | orta (BL-676, YENİ-4) |
| **Sekmeler: Upcoming bugün dahil, Past geçmiş** | Var. Ama Past sekmesinde düzenlenebilen satırlar da duruyor (bu haftanın geçmiş günleri) | `dateTab` cihazın bugününü kullanıyor, sunucu kilidi haftanın başını; `is_past` okunmuyor | düşük (YENİ-4) |
| **B1 Archive iki tık kırmızı, "Delete" adı yok** | Tek tık; pencerede "Delete date" | BL-595 | orta |
| **Boş hâl ortak dilde + "New date"** | Eski `settings-empty`; düğme yok | `:737-753`; ortak sınıf `catalog-table-empty` dört sayfada var, burada yok | düşük (YENİ-5) |
| **Sayfalama 25 / 50 / 100** | Yok | BL-787 | orta |
| **Telefonda kart satırı** | Izgara | BL-599 | orta |
| **K1 müdür çok lokasyonlu kayıt açamaz** | Kural tutuyor, ama müdür iki lokasyon seçince Save sessizce griye dönüyor, neden yazmıyor | `mayManageLocations` `:94-97`, `canSave` `:201-208` | düşük (YENİ-6) |
| **Başlık satırı tek ölçü (11 px)** | Type / Locations / Impact başlıkları 12 px soluk | `:613-615` `job-department-cell` → `jobs-settings.css:448-450` | düşük (YENİ-7) |

Kodda doğru olanlar (aynı ölçüm):
- K8 (önemli tarih): Unpublish ve Republish ayrı; Restore → Unpublished, bildirim yok (`set_…_state_service:50-58`). Ekranda satır menüsünde var (`:704-732`).
- K10: Schedule yalnız yayındaki ve arşivlenmemiş tarihleri okuyor (`schedule-service.ts:485-487`).
- K11: sunucu geçmişi reddediyor. Çok günlü tarihin geçmiş günlerini ayrı kayda bölüyor (`important_date_keep_past`). Yıllık tarihi bir sonraki yıla taşıyor (`save_…:62-68`).
- K1 kapsam: `can_target_workspace` / `write_wide` sunucudan geliyor (`read_…:16-20`). Müdürün yeni tarihi tek lokasyonuyla açılıyor (`:171-178`).
- K6 / K2 süzgeci ve "Hidden change" maskesi sunucuda (`read_important_date_history_service:31-44`). Derin ölçüm güvenlik raporunun (B) işi.
- G14 S1: Important Dates "bugünü" cihazın takviminden alıyor (`todayIn`, `:26`).
- KARARLAR:308 sütun genişlikleri (28/18/16/20/18) CSS'te tutuyor (`jobs-settings.css:2023-2027`). Ekleme düğmesi "New date" yeşil (LIST-YESIL `529d6e98`).

## 4. Eski dal hasadı (`task/fb-6.7-ui`, KK-182 K2)
Ölçüm:
- `git log 3ec4985c..task/fb-6.7-ui` → 16 commit.
- `git diff --stat` → 46 dosya, +5890 / −116.
- Önemli tarih ve kapalı gün parçaları:

| Parça (commit) | Bugün geçerli mi | Öneri |
|---|---|---|
| Kapalı gün etki listesi `ClosureShifts` + `closurePreview` sorgusu + "Save · N shifts to open" + `closure_changed`'de listeyi yeniden okuma (`526e66fd`) | Evet. K13, C1-B ve sunucu sözleşmesiyle birebir | **Taşı** (mantık + bileşen). Yeni dosyaya elle aktarılır |
| Kapalı günü yeniden yayınlamak pencereyi açar (`526e66fd`, satır menüsü) | Evet (K13, DL13) | **Taşı** |
| History sekmesi + zaman çizelgesi + "Hidden change" (`6bd73c05`, `1d1b4325`) | Evet (B3-A). Satır biçimi duyurunun C1'iyle uyuşmuyor (K3) | **Taşı**, biçim koordinatör kararıyla |
| Geçmiş tarih salt okunur pencere, "Close", `min={locked_before}`, "Past dates are read-only. Pick <date> or later." (`19a6b16d` civarı) | Evet (K11, DW12, DW18). Yalnız geçmişi açıyor; K2 kilidini açmıyor | **Taşı + genişlet** (BL-676) |
| `closureMessage`: "Closed day saved / archived / republished. N shifts …" (K15) | Evet. Unpublish dalı eksik (D9) | **Taşı + Unpublish ekle** |
| `important-date-window.css` (184 satır) | Kısmen. Ölçüler DOC-TABLE'dan önce | **Taşı**, görsel QA ile |
| e2e `closed-day-reaches-shifts.spec.ts` (Ayşe, Ali, Emre; Keep / Open; arşivde "1 shift stays open") (`1a2be710`) | Evet. Ama "Add date" düğmesine ve tek tık Archive'a basıyor; bugün ad "New date", Archive iki tık olacak | **Taşı + iki satırı güncelle**. Main'de önemli tarih e2e'si hiç yok (`grep -rli important e2e` boş) |
| "Show archived" anahtarı, satırda "Past" etiketi, `Plus` ile beyaz ekleme (dalın liste kısmı) | Hayır. KARARLAR:558 sekmeler (2026-10-05), DOC-TABLE çipleri, LIST-YESIL | **Bırak** |
| Pencerede "Delete date" paneli (dalda değişmemiş) | Hayır (B1) | **Bırak**, B1 ile değişir |
| Conflict handling: "Closed location", "Block / Ask every time / Ask once per edit" (`20d006e0`) | Main'de hâlâ "Closed location or shift type" ve eski adlar (`ConflictHandlingSettingsPage.tsx:29-32, 52`) | **Sınırda** (YENİ-S1). Adların Mert'e mi ait olduğu dal yorumunda iddia ediliyor, KARARLAR yalnız "Warn kalkar" diyor |
| Quick editor ve drop review kapalı gün oturumu (`0e62baca`), "!" balonu (`17ed8749`…`26eb56c7`), ShiftCard `published` (`19a6b16d`) | Main bunları başka yoldan kapattı: BL-606 `021da39d`, BL-685 `e986f346`, BL-540 kapalı; "Changed after publishing" `ShiftCard.tsx:132` | **Bırak** (EKRAN-01'in malı, eskimiş) |
| Duyuru parçaları, varyant laboratuvarı (`dev/fb67`, `dev/ann-flow`) | EKRAN-07'de çelişkili bulundu | **Bırak** |

Dalın kaderi: hasat bitince (EKRAN-08 uygulama dilimi main'e girince) silinebilir. Guard yedeği alır.

## 5. YENİ bulgular
1. **YENİ-1 (leave: high / do: moderate) Kapalı gün, yayınlanmış vardiyası olan güne kaydedilemiyor ve yeniden yayınlanamıyor (K13 ekranda yok).**
   - Ekranda nerede: Important Dates → New date / satır → pencere; satır menüsü → Republish.
   - Örnek: Ayşe 14 Ekim'i Kadıköy için "Closed day" yapar. Ali ve Emre'nin o gün yayınlanmış vardiyası var. Save'e basınca "Review the shifts on this closed day again." çıkar ve liste yok; Ayşe kaydedemez. Unpublish edilmiş bir kapalı günü yeniden yayınlamaya çalışınca da aynı ret gelir. K14 bildirimi ("your shift was removed") da bu yüzden hiç doğmuyor.
   - Kanıt:
     - sunucu `save_important_date_service:87-93` ve `set_important_date_state_service:39-45` (canlı);
     - API `important-dates-routes.ts:53-66`;
     - veri katmanı `organization-data.ts:421-432`, ekranda kullanılmıyor;
     - ekran `:117-127` ve `:704-716` `closure` göndermiyor;
     - cümle `http-error.ts:139-142` ile olduğu gibi ekrana geçiyor (tırnaksız RAISE).
   - Sunucu şartı 2026-10-02'de (`af0bcb96`, FB-6.7 C) main'e girdi. Web testi kaydı taklit verdiği için (`ImportantDatesSettingsPage.test.tsx:238-270`) kırık görünmedi; e2e yok.
   - Önerim: dalın listesi ve e2e'si taşınır (bölüm 4). Sınıf R2: web + e2e, sunucu sözleşmesi değişmiyor.
2. **YENİ-2 (leave: medium / do: safe) Kapalı gün sonuç satırları yok (K15, K16).**
   - Örnek: Ayşe 24 Ekim kapanışını arşivler. Ekranda "3 shifts stay open" görmez; açıkta kalan vardiyaları Schedule'da kendisi bulmak zorunda kalır.
   - Kanıt: sunucu `shifts_stay_open`, `draft_shifts_opened` döndürüyor (`set_…_state_service:92-94`, `save_…_service:164-166`); sayfa yalnız `refresh` yapıyor (`:120-133`).
3. **YENİ-3 (leave: medium / do: safe) Önemli tarihin History'si ekranda yok (B3-A).**
   - Örnek: owner Zeynep "Inventory day"in tarihinin kim tarafından 12'den 14'e çekildiğini görmek ister. Pencerede sekme yok.
   - Kanıt: sunucu ve API hazır (`read_important_date_history_service`, `important-dates-routes.ts:100-110`, `getImportantDateHistory` `organization-data.ts:486-492`); sayfada `history` grep 0. Yerel DB'de 6 değişiklik satırı birikmiş, okunamıyor.
4. **YENİ-4 (leave: low / do: safe) Past sekmesi ile sunucunun kilidi farklı; formda geçmiş gün seçilebiliyor.**
   - (a) `dateTab` cihazın bugününe bakıyor, sunucu kilidi haftanın başına (`locked_before`).
     - Örnek: Salı günü, dünkü (Pazartesi) "Health inspection" Past'ta durur ama düzenlenebilir.
     - Kanıt: `:764-767` `is_past` okunmuyor; sunucu `read_…:21, 30`.
   - (b) Yeni tarih formunda takvimin alt sınırı yok (`:473-501`). Geçen haftayı seçen Ayşe "Past important dates are read-only." görür; hangi günden itibaren seçebileceği yazmaz.
     - Dal bunu `min` ve "Pick <date> or later" ile çözüyor (DW12).
5. **YENİ-5 (leave: low / do: safe) Boş hâl ortak dilde değil.**
   - `settings-empty` kullanılıyor (`:737-753`), ortak `catalog-table-empty` değil (öteki dört liste sayfası onu kullanıyor). Açık yeşil daire yok, boş hâlde "New date" yok.
   - Süzgeçle boş kalınca "No upcoming important dates" yazıyor. Bu durumda "eşleşen yok" demesi gerekirdi.
   - Kanıt: KARARLAR:557, :309.
6. **YENİ-6 (leave: low / do: safe) İki lokasyonun müdürü iki lokasyon seçince Save nedensiz griye dönüyor.**
   - Örnek: Kadıköy ve Erenköy müdürü Veli ikisini birden işaretler; Save kapanır, sebep yazmaz.
   - K1 doğru uygulanıyor, eksik olan tek satırlık açıklama.
   - Kanıt: `:94-97`, `:201-208`.
7. **YENİ-7 (leave: low / do: safe) Başlık satırında üç sütun adı öteki ikisinden büyük ve soluk.**
   - Type / Locations / Impact 12 px `--job-muted`; Important date ve Date 11 px.
   - Kanıt: `:613-615` `job-department-cell`; `jobs-settings.css:448-450`; ortak kural `list-page.css:189-199`; P4 E-X2.
   - Ekranda ölçülmedi, görsel QA'ya (C).

Sınırda YENİ:
- **YENİ-S1 (leave: low / do: safe) Settings → Conflict handling'de kural adı "Closed location or shift type", açıklaması "Assignments on a closed date."** Vardiya türüne özel kapanış 2026-10-02'de kalktı (BL-530, KK-91 (f)). Seçenek adları "Require confirmation / Confirm once per editing session / Block". Dalda düzeltilmiş (`20d006e0`), main'de değil (`ConflictHandlingSettingsPage.tsx:28-33, 52`). C2-A. Settings turunun işi.

## 6. Sınırda (bu ekranın turunda kapanmaz)
- **EKRAN-01 (Schedule):**
  - BL-238: kilit çizgisi UTC'ye göre hesaplanıyor. Önemli tarihin geçmiş kilidi de aynı çizgiyi kullanıyor (`read_…:12`).
  - BL-701: Schedule önemli tarihleri API'de süzüyor.
  - BL-762 (3): kapalı gün sınırında Undo testi yok.
- **Ekran 9 (Notifications):** K5, K7, K14 bildirimlerinin görünümü; önemli tarih bildiriminin kime gittiği (`important_date_recipients`, `important_date_notified`). Kişi listesinin derin ölçümü B'nin işi.
- **Settings turu:** YENİ-S1; BL-549'un lokasyon geri alma yolu.
- **Ortak bileşen (EKRAN-02 C3):**
  - BL-593: başlıklarda `columnheader` + `aria-sort` var (`:621-622`), kapsayan `table` / `row` rolü yok;
  - BL-602: Upcoming / Past / Archived ok tuşuyla gezilmiyor;
  - BL-665: son satır menüsü kesilebilir, ölçülmedi;
  - BL-600: arama kenarı `#aeb9b4`;
  - BL-255: Cancel `.job-secondary-button`;
  - BL-515: çekmece açıkken toast;
  - BL-654 ailesi: sunucu cümlesi ekranda (`errorText` = `error.message`, `GeneralSettingsPage.tsx:324-328`).
- **EKRAN-07:** duyuru kararlarının önemli tarihe taşınmaması (KARARLAR:204). Başlık 3 konuşulmadıkça önemli tarih K1–K18'le sürer.
- **Kapalı:** BL-537 (`schedule_closures` taraması), BL-043 (bayat), BL-545, BL-606, BL-685. Hükümleri kayıtta, iş yok.

## 7. Sorular ve öneriler
Mert'e (§13 şablonu ekran oturumunda kurulur):
- **S1 (P18, davranış konuşması):** Kapalı gün ve önemli tarihin davranışı (Başlık 3) uygulamadan önce konuşulsun mu?
  - Bugün: kurallar 2026-10-02'den (K1–K18) duruyor. Mert 2026-10-04'te C'nin davranışını senaryo senaryo konuşmak istemişti ve uygulama bu yüzden durmuştu (KARARLAR:553).
  - Örnek senaryolar: Ayşe'nin kapalı günü Ali'nin vardiyasına düşer; Zeynep kapanışı arşivler; Veli iki lokasyonu birden kapatmak ister.
  - Önerim: kısa bir konuşma, gösterim dalın gerçek ekranıyla. Canlı kullanıcı yok, bekleme kimseye zarar vermiyor (P01).
  - Dayanak: Mert'in 2026-10-04 kararı (KARARLAR:553), ILKELER P18.
- **S2 (BL-679):** Yıllık tarih hangi sekmede dursun?
  - Seçenekler: (a) her zaman Upcoming'de, bir sonraki tekrarının tarihiyle; (b) bugünkü gibi Past'ta; (c) bu yılki Past'ta, gelecek tekrar Upcoming'de.
  - Önerim (a): sunucu yıllık tarihi zaten hiç "geçmiş" saymıyor, düzenlenebilir bırakıyor.
  - Dayanak: yok — yeni karar (K11 yalnız kilidi söylüyor).

Koordinatöre:
- **K1:** EKRAN-08 uygulama dilimi:
  - (1) dal hasadı: YENİ-1, YENİ-2, YENİ-3, BL-676'nın geçmiş kısmı, e2e. R2, web + e2e; sunucu değişmiyor.
  - (2) liste dili: YENİ-4, YENİ-5, YENİ-6, YENİ-7, BL-595, BL-787, BL-599. R1/R2.
  - (3) veri temizliği: BL-547, BL-550, BL-546, BL-551, BL-548, BL-544. R2/R3, `nf-db`.

  S1 cevabı (1)'in önünde.
- **K2:** `task/fb-6.7-ui` hasat bitince silinir; worktree `newfork-wt/fb-6.7-ui` kapanır. O güne kadar dokunulmaz.
- **K3:** History satırı biçimi: önemli tarih (dal, B3-A) ile duyuru (C1) tek zaman çizelgesi dilinde mi olsun? Ortak değer; CLAUDE.md "ortak değer değişince" sırasıyla yazılır, uyuşmayan ekran adıyla söylenir.
- **K4:** BL-605'in Important Dates kısmı BL-676 ile kapanır. BL-598, BL-599 kart satırıyla kapanır; ayrı iş açılmaz.

## Kanıt komutları
- `git rev-parse --short origin/main` → `20332d46`. Worktree HEAD aynı.
- `git log --oneline 44e41a54..origin/main -- <ekranın 4 dosyası>` → boş.
- `grep -o "BL-[0-9]* (leave" docs/plan/BACKLOG.md | sort -t- -k2 -n | tail -1` → BL-878.
- `grep -rln "previewImportantDateClosure\|getImportantDateHistory" apps/web/src` → yalnız `organization-data.ts`.
- `grep -rli important e2e` → boş.
- `git log --format='%h %ad' -S previewImportantDateClosure -- apps/web/src/settings/organization-data.ts` → `af0bcb96 2026-10-02`.
- `git rev-list --count $(git merge-base origin/main task/fb-6.7-ui)..origin/main` → 314. Dal ucu `4d9226cc` (2026-10-04 01:39 PDT); `git worktree list` → `newfork-wt/fb-6.7-ui` açık.
- Yerel DB SELECT'leri (scratchpad `q1.sql`–`q7.sql`):
  - `max(version)` = `20261007130000`.
  - Önemli tarih fonksiyonları: 17 `app_private` + 5 `public`.
  - Tablolar: `important_dates` (20 sütun, `status`, `revision`, `delivered_to`), `important_date_changes` (6 satır), `important_date_shift_releases` (1 satır).
  - Yerel kayıtlar: 2 yayındaki event + 1 arşivli closed_day.
  - Canlı gövdeler `save_important_date_service` (`closure_changed` satır 92), `set_important_date_state_service` (39-46, 90-94), `read_settings_important_dates_service` (12, 21, 30, 38-42), `read_important_date_history_service`, `important_date_is_past`, `important_date_keep_past`.
  - `pg_indexes important_date_shift_releases` → 2 indeks.

Yazılan dosya: yok. Salt okuma; geçici SQL ve diff dosyaları yalnız scratchpad'de.
