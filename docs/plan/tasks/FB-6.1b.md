# FB-6.1b Lokasyon bazlı kaydetme ve yayınlanmış plan önizlemesi (B2, B4)
Status: draft (2026-09-27). B2 tarafı soru istemiyor, `.1` hazır; B4 tarafı kullanıcı cevabı (S1–S3) bekliyor.
Session: -   Branch: task/fb-6.1b   Worktree: newfork-wt/fb-6.1b   DB: lock (`.1` migration + pgTAP, `.3` e2e)
Reviewer: `nf-guvenlik` (her adım); `.2` ekran değiştirdiği için ayrıca `nf-gorsel-qa`.

Kaynak: KARARLAR "Taslak ve lokasyon" B2, B4 (kullanıcı kararı 2026-09-25); `docs/plan/research/fb61-dis-degerlendirme-2026-09-25.md` bölüm B; `FB-6.1.md` Out of scope ve K-3; FOUNDATION-B dilim tablosu; BACKLOG BL-159.

## Tazelik (2026-09-27, `origin/main` `394434c4`, yerel DB yalnız SELECT)
Dilim açıldığında (09-25) B2'nin kaydetme tarafı "tasarım ister" diye yazılmıştı. Bugün ölçülünce çoğu zaten yapılmış çıktı; dilim küçüldü.

| Ne | Bugün | Hüküm |
|---|---|---|
| B2 — düzenleme yalnız kişinin lokasyonlarını alır | `acquire_schedule_edit_session_service` istenen lokasyonları `scope_set(…, 'schedule.edit')` ile kesiyor ve yalnız o lokasyonların vardiyalarını yüklüyor (canlı tanım, `effective`/`adding`). Test: `schedule_edit_locks.test.sql` "an edit of Kadikoy loads only the Kadikoy part of the draft" | **bayat — yapılmış** |
| B2 — kaydetme yalnız o lokasyonları yazar | `save_schedule_edit_session_service` taslakta yalnız `session.location_ids` satırlarını silip yeniden yazıyor, kalan lokasyonlar olduğu gibi kalıyor (BL-097). Test: aynı dosya, "BL-097: saving a Kadikoy edit keeps the draft's Besiktas shifts" (`ci-green.txt:62`) | **bayat — yapılmış** |
| B2 — yayın lokasyon bazlı | FB-6.1 `.4` (`b126918`): yayın hedefi ⊆ `scope_set`, taşan `authz.out_of_scope` | **bayat — yapılmış** |
| B2 — kilit taslak başına (K-3) | Test: "Mehmet cannot open the draft Ayse is editing, even for Besiktas" | **bayat — yapılmış** |
| **B2'nin açık kenarı = BL-159** | Vardiya ekleme (`mutate_schedule_edit_shift_service`) yalnız `authorize(…, 'schedule.edit', target_locations => [lokasyon])` soruyor, düzenlemenin tuttuğu lokasyonlara (`session.location_ids`) bakmıyor; şablon uygulama (`apply_schedule_template_service`) yalnız şablon kapsamına bakıyor; kaydetmenin yazma adımı oturumdaki bütün vardiyaları lokasyon süzgeçsiz yazıyor. Sonuç: Kadıköy + Beşiktaş müdürü yalnız Kadıköy'ü düzenlerken Beşiktaş'a vardiya eklerse, kaydetme bunu taslağın Beşiktaş satırlarını silmeden ekler → çift ya da yetim satır. Bu durumu (düzenlemeyi tutan kişinin kendisi, yönettiği ama düzenlemede olmayan lokasyon) sınayan test bulunamadı (grep) | **geçerli** |
| B4 — "yayınlanmışları ghost göster" anahtarı | Hiçbir şey yok. Ama düzenleme sırasında ekran yayınlanmış okuma modelini zaten yüklüyor (`apps/web/src/views/SchedulePage.tsx:633-635`, `query.data`); düzenlemenin "boş başladı" bilgisi zaten var (`schedule_edit_source` = `blank`, `SchedulePage.tsx:899`); oturum vardiyası hangi yayınlanmış vardiyadan geldiğini taşıyor (`source_published_shift_id`). Ghost'lar bugün çakışma hesabına giriyor (`apps/web/src/schedule/hooks/useCellState.ts:77`) | **geçerli** — büyük olasılıkla yalnız web işi, DB değişmez |
| Izgara bütçesi | Son ölçüm owner 15.7–16.5 ms, manager 11.3–11.6 ms (FB-6.1 `.4`, 2026-09-26 06:01); sınır 50 ms | B4 web'de kalırsa etkilenmez |

## Goal
İki şey. (1) Açık bir düzenleme yalnız tuttuğu lokasyonlara yazar. Örnek: Mina Kadıköy ve Beşiktaş'ı yönetiyor, "Standard week" taslağını yalnız Kadıköy için açmış. Beşiktaş'a vardiya ekleyemez, ekrana açık bir "bu düzenlemede değil" cevabı gelir; kaydettiğinde taslağın Beşiktaş kısmı bir satır bile değişmez. (2) Boş başlatılan bir planda, yönetici bir aç/kapa anahtarıyla o haftanın yayınlanmış vardiyalarını soluk (ghost) olarak görür. Bunlar yalnız referanstır; uyarı ve engel üretmez. Örnek: Ayşe Beşiktaş için boş plan açar, anahtarı açar, Ali'nin Kadıköy'deki Salı 09:00–15:00 vardiyasını soluk görür ve Ali'yi Beşiktaş'ta öğleden sonraya koyar.

## Açık sorular (B4; kullanıcıya, önerilen ilk)
- **S1 — Anahtar açıkken hangi yayınlanmış vardiyalar görünsün?**
  - (a) **(Önerilen)** O haftanın bütün yayınlanmış vardiyaları: hem taslağın kendi lokasyonlarının yayındaki planı (boş planın yerine geçeceği şey) hem de ızgaradaki kişilerin başka lokasyonlardaki vardiyaları. Tam referans; KARARLAR örneğini de kapsar.
  - (b) Yalnız başka lokasyonlardakiler (KARARLAR örneğinin harfiyen okuması: Beşiktaş planını yaparken Kadıköy'ünkiler).
  - (c) Yalnız taslağın kendi lokasyonlarının yayındaki planı.
- **S2 — Anahtar ne zaman var?**
  - (a) **(Önerilen)** Her plan düzenlemesinde. Boş başlatılıp kaydedilen bir taslak sonra yeniden açıldığında da anahtar kaybolmaz. Taslakta zaten satırı olan yayınlanmış vardiya ikinci kez soluk gösterilmez.
  - (b) Yalnız boş başlatılan düzenlemede (KARARLAR'un harfiyen okuması). Kaydedip yeniden açınca anahtar gider, çünkü taslak artık "boş başladı" bilgisini taşımıyor; taşısın istenirse DB'ye bir alan eklenir.
  - (c) Boş başlatılan taslaklarda, kaydedilip yeniden açılınca da. Taslağa "boş başladı" işareti gerekir (`nf-db`, küçük migration).
- **S3 — Anahtarın başlangıç durumu:**
  - (a) **(Önerilen)** Kapalı başlar, kişinin son seçimi o tarayıcıda hatırlanır.
  - (b) Açık başlar.
  - (c) Her düzenlemede kapalı başlar, hatırlanmaz.
- **Cevaplar (kullanıcı, 2026-09-28):** S1 (a) haftanın bütün yayınlanmış vardiyaları; S2 (a) her plan düzenlemesinde; S3 (a) kapalı başlar, son seçim o tarayıcıda hatırlanır.

Kurallardan çıkan, soru olmayanlar:
- Anahtar yalnız görünümü değiştirir. Yayın kontrolü ve çakışma hesabı anahtardan bağımsızdır, bugünkü gibi kalır (B4: "uyarı ve engel hesaplamasına girmez").
- Kişinin erişemediği lokasyondaki vardiya zaten B1 ghost'u olarak görünür ve uyarı verir. Anahtar açıkken de B1 kuralı geçerlidir; iki türün çakıştığı yerde uyarı kalkmaz.
- Anahtar düzenlemeden çıkarmaz, kilidi etkilemez.

## Teknik seçimler (`nf-db` + `nf-guvenlik`; kullanıcı sorusu değil)
- **T1 — BL-159: düzenlemede olmayan lokasyona yazma.** (a) **(Önerilen)** Reddedilir: 42501 + `authz.out_of_scope`. Gerekçe: bilinmeyen hedef ve kapsam dışı hedef aynı cevabı alır (CLAUDE.md §9). Web, filtre değişince düzenlemeyi zaten genişletiyor (`acquire…` "resumed" dalı, BL-069); `.1` bu yolun ekranda gerçekten kullanıldığını doğrular. (b) Otomatik genişletme: vardiya eklenince düzenleme o lokasyonu da alır. Kaydetmenin önce o lokasyonun taslak satırlarını yüklemesi gerekir; daha karmaşık.
- **T2 — Şablon uygulamada düzenlemede olmayan lokasyon.** (a) **(Önerilen)** Reddedilir, mesaj hangi lokasyonların düzenlemede olmadığını söyler; kısmi ve sessiz yazma olmaz. Şablon kapsamı dışındaki lokasyonlar bugün zaten bütün uygulamayı reddediyor (`23503`); aynı biçim korunur. (b) O lokasyonların vardiyaları atlanır. Sessiz veri kaybı gibi görünür, önerilmez. Kullanıcıya sorulması gerekirse koordinatör sorar.
- **T3 — Kaydetmede ikinci kilit.** Kaydetmenin yazma adımı yalnız `session.location_ids` içindeki vardiyaları yazar. T1 ve T2 kapansa bile, oraya başka bir yoldan satır girerse diye ikinci savunma.

## In scope
- `.1` BL-159 kapanışı: T1, T2, T3; önce kırmızı pgTAP hücreleri, sonra düzeltme; yetki matrisinde yeni hücreler.
- `.2` B4 anahtarı (web): S1–S3'e göre görünüm; anahtarla gelen ghost'lar çakışma hesabından hariç; taslak satırıyla aynı yayınlanmış vardiya ikinci kez gösterilmez. DEV'de 2–3 görsel varyant (anahtarın yeri, soluk vardiyanın görünüşü); kullanıcı seçer.
- `.3` e2e: bir B2 ve bir B4 senaryosu.

## Out of scope
- Lokasyonlar arası ortak taslak düzenleme daveti (BL-126; yetki çekirdeğine dokunur).
- Lokasyon başına kilit (K-3 ile kapalı; kilit taslak başına kalır).
- Kaydettikten sonra "Beşiktaş kısmı olduğu gibi kaldı" notu. Yönetici o kısmı zaten görmüyor (B1), yani şaşıracağı bir şey yok. Görsel QA'da kafa karışıklığı çıkarsa backlog'a gider.
- Okuma modelini (`get_schedule_read_model_service`) değiştirmek. `.2` yeni bir DB alanı gerektirirse (yalnız S2 (c) seçilirse) durulur, `nf-db` alt adımı açılır.

## Done when
1. pgTAP (`schedule_edit_locks.test.sql`, önce kırmızı): Kadıköy + Beşiktaş müdürü yalnız Kadıköy'ü düzenlerken Beşiktaş'a vardiya ekleme ve güncelleme 42501 + `authz.out_of_scope` döner (T1).
2. pgTAP: aynı düzenlemede Kadıköy + Beşiktaş şablonunu uygulamak T2'ye göre reddedilir, düzenlemeye satır girmez.
3. pgTAP: kaydetme, oturuma zorla sokulmuş düzenleme dışı bir satırı taslağa yazmaz (T3); taslağın Beşiktaş satırları sayı ve içerik olarak değişmez.
4. Mevcut B2 testleri yeşil kalır: BL-097, K-3 çakışması, "Kadikoy loads only the Kadikoy part".
5. `authorization_matrix`'te T1/T2 hücreleri sınıflı; `authz_catalog` sayaçları artmaz; BL-159 BACKLOG'da kapanır.
6. Web vitest (`useCellState` + ekran testi): S1–S3'e göre anahtar görünür ve çalışır. Açıkken yayınlanmış vardiyalar ghost olarak gelir ve çakışma/uygunluk uyarısı üretmez. B1 ghost'ları uyarı vermeye devam eder. Taslak satırıyla aynı yayınlanmış vardiya bir kez görünür. Anahtar düzenlemeyi kapatmaz.
7. e2e: (a) B2: Kadıköy + Beşiktaş müdürü filtreyi Kadıköy'e alır, vardiya ekler, kaydeder; taslağın Beşiktaş kısmı değişmemiştir. (b) B4: boş plan, anahtar açılır, başka lokasyondaki yayınlanmış vardiya soluk görünür, uyarı yoktur.
8. `schedule_grid_read_budget` yeşil. DB okuması değişmediyse yeniden ölçüm gerekmez; değiştiyse ölçülür ve ≤50 ms kalır.
9. `nf-guvenlik` ONAY (her adım), `nf-gorsel-qa` ONAY (`.2`).

## Touches
- `.1` `nf-db`: `supabase/migrations/<ts>_an_edit_writes_only_where_it_holds.sql` (`mutate_schedule_edit_shift_service`, `apply_schedule_template_service`, `save_schedule_edit_session_service`); `supabase/tests/schedule_edit_locks.test.sql`, `supabase/tests/authorization_matrix.test.sql`.
- `.2` `nf-arayuz`: `apps/web/src/views/SchedulePage.tsx`, `apps/web/src/schedule/hooks/useCellState.ts` (+ test), `apps/web/src/schedule/components/ScheduleRow.tsx` / `ShiftCard.tsx` (ghost görünüşü), ilgili CSS. Veri hook'u değişirse o kısım `nf-backend`'e (§4).
- `.3` `nf-test`: `e2e/` altında Schedule senaryoları.
- `nf-planlama`: bu dosya, BACKLOG BL-159 kapanışı, DONE.md.

## Alt adımlar
| Adım | İş | Sahip | Bağımlılık |
|---|---|---|---|
| `.0` | S1–S3 kullanıcıya (K16); T1/T2 teyidi ✓ | koordinatör | — |
| `.1` | BL-159 (T1–T3), kırmızı hücre → düzeltme | `nf-db` | BL-218 `.2`'den sonra (ikisi de `apply_schedule_template_service`'e dokunuyor; ILERLEME-PLANI Ç8). Çekirdeğe dokunmaz (Ç4) |
| `.2` | B4 anahtarı + DEV varyantları | `nf-arayuz` | `.0` cevabı |
| `.3` | e2e iki senaryo | `nf-test` | `.1` ve `.2` main'de |

Tahmini boyut: `.1` yarım gün, `.2` bir gün, `.3` yarım gün.

## Test plan
`.1`: `pnpm.cmd test:db` odaklı (`schedule_edit_locks`, `authorization_matrix`, `authz_catalog`), tek transaction + rollback denemesi (CLAUDE.md §7). `.2`: odaklı vitest + `typecheck` + `lint`. `.3`: `pnpm.cmd e2e` (DB kilidiyle). Kapanışta tam kapı.

## Risk
- **B1 ghost'larının uyarısı yanlışlıkla kapanır.** `.2` çakışma hesabından yalnız anahtarla gelen ghost'ları çıkarır; aynı hesap B1 ghost'larını taşıyor (`useCellState.ts:77`). Önlem: Done when 6'da ayrı hücre.
- **T1 görünmeyen bir web yolunu kırar.** Örneğin sürükle-bırakla vardiyayı lokasyon satırları arasında taşımak ya da filtre değişmeden ekleme. Önlem: `.1` web'de bu yolları arar; e2e (a).
- **Soluk vardiya gerçek vardiya sanılır.** Önlem: görsel varyantlar, `nf-gorsel-qa`, kontrast (BL-154 ile aynı aile).

## Pre-mortem ("3 ay sonra neden başarısız?")
1. *Dilim B2 için boşa açıldı.* Tazelik bunu yakaladı: B2'nin kaydetme ve yayın tarafı zaten main'de, dilim BL-159 ile B4'e indi.
2. *Anahtar kimsenin kullanmadığı bir düğme oldu.* Yönetici boş planı nadiren açıyor olabilir; S2 (a) anahtarı her düzenlemeye verir. Kullanım ölçümü yok (MVP sonrası).
3. *Daha basit alternatif:* B4 yerine düzenleme sırasında yayınlanmış haftayı ikinci bir sekmede açmak. Kod yok, ama kullanıcı kararı "ızgarada anahtar"; önerilmez.

## Skills
`.1`: `superpowers:test-driven-development` (kırmızı hücre önce), `supabase:supabase-postgres-best-practices`. `.2`: `frontend-design`, `superpowers:test-driven-development`. İnceleme: `security-review`.

## Notes / Result
- 2026-09-27 (`nf-planlama`): görev dosyası yazıldı (koordinatörün görevi). Tazelik: B2'nin dört parçası main'de; açık kalan BL-159 (geçerli). B4 yok, büyük olasılıkla yalnız web işi. Kullanıcıya üç soru (S1–S3), koordinatöre iki teknik teyit (T1, T2).
- 2026-09-28 (koordinatör, kayıt `nf-planlama`): T1 = reddet (42501 + `authz.out_of_scope`), T2 = reddet — teyitli. `.1` sırası BL-218 `.2`'den sonra (Ç8).
