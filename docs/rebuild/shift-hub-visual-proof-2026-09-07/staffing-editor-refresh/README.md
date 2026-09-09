# AT32 / AT35 — açık manager editoründe güncel uygunluk

2026-09-07. Gerçek yerel manager Auth/API ve sahipli IAB tab10. Accessibility tree, normal tıklamalar ve klavye odağı gözlendi; screenshot veya görsel puan verilmedi. Ayrı API oturumu kullanıldı; iki browser/P95 testi değildir.

## Gerçek akış

1. QA Dining, 16 Kasım, Drew QA 16:00–22:00 → Replacement. Alex Morgan full-interval eligible. Gerekçe: `AT35 keep my replacement reason during staffing refresh`.
2. Review impact başarılı; Confirm change ve Send offer görünür. Başlangıç odağı Review the change başlığında; üç Tab ile Cancel'a geçildi.
3. Ayrı gerçek manager API oturumu, Alex'e aynı gün 17:00–18:00 ek assignment oluşturdu. Ürün tablosuna doğrudan atama yazılmadı; fresh preview + `/schedule/lineups/operations` kullanıldı.
4. Açık editor manuel yenileme olmadan güncellendi: full-interval aday sayısı14→13; seçili Alex disabled/ineligible gruba geçti ve overlap açıklaması göründü. Eski review, Confirm change ve Send offer kaldırıldı. Yeniden Review impact sunuldu; gerekçe aynı, odak Cancel üzerinde kaldı. Seçili aday sonradan uygun olmasa da fresh preview sunucudaki kontrollerden geçmek zorundadır.
5. Sonraki cleanup tıklamasında araç eski AX elementini reddetti; yeni AX sayfanın editor dışında olduğunu gösterdi. Bu sonraki sayfa değişiminin nedeni doğrulanmadı; önceki açık-editor kanıtıyla karıştırılmadı.
6. Yalnız bu test assignment'ı manager release API ile kaldırıldı. İlk cleanup preview, `employee_id` taşındığı için haklı olarak reddedildi; yazım olmadı. Verifier release payload'ını `employee_id:null` yapınca yeni preview/apply geçti. Open need ve audit korunur; broad delete yok. İlk iki mevcut assignment'ın tüm entry içerikleri önce/sonra eşit. Yeni entry employee null: PASS.

Kimlikler (sahipli yerel fixture):

- Workspace: `e2afe393-c45d-4537-b984-114300cf568e`
- Test published shift: `3c0fc0f4-25b7-492b-a509-78e11976fc6e`
- Test Line Up entry: `0c57a4be-8aa7-48c3-80b8-3241d17e0a82`
- Assign event: `cbeb87db-89f5-47e6-a684-22d14852b35e`
- Restore release event: `fdcbfbcf-653d-4d3b-9499-b977949619a0`
- Verifier: `supabase/verification/shift_exchange_editor_refresh_local.py`
- Local report: `supabase/.temp/shift-exchange-editor-refresh.json`

## Uygulama ve kontroller

`refreshExchangeSurfaces` artık gerçek `lineup-candidates` key'ini kapsar. Önceki synthetic cache testleri bu eksik key'i yakalamıyordu; yeni component testi gerçek LineupEditor/QueryClient ve refresh fonksiyonunu birlikte kullanır. Schedule'ın gerçek `schedule-read` ve diğer Line Up key'leri mevcut kapsamla karşılaştırıldı. Draft tutan `schedule-pending-ops` key'i körlemesine invalidation'a eklenmedi.

Editor review; operation, mevcut source ve source'un hâlâ modelde bulunması, seçili aday/counterpart ve read-error durumu ile ilişkilidir. İlgili içerik değişince review kapanır; aynı içerikle sessiz refetch review'ı korur. Aday veya farklı gün destination sorgusu yenilenirken final/offer bekler; hata halinde eski veriyle onay sunulmaz. Review isteği sürerken context değişmişse geç cevap atılır. Kullanıcı başka kontrole geçmişse focus alınmaz; gerekçe ve seçim korunur. Sunucunun final fingerprint/eligibility kontrolleri devam eder.

Son test çalışması: **20/20** (LineupEditor7, realtime hook5, manager queue4, placements4). Yeni7 test: gerçek candidate-key refetch, identical refresh, source revision, late preview, pending candidate read, removed source, failed candidate refresh. Hedefli ESLint ve diff whitespace PASS. Python doğrulama scripti local Auth/API ile çalıştı; cleanup sonrası bağımsız snapshot kontrolü PASS.

Genel web typecheck bu tur **FAIL**: `src/employees/EmployeeDrawer.test.tsx:228` içindeki Testing Library `queryByRole` seçeneklerinde `exact` TS2769. İlgisiz paralel WIP dosyası değiştirilmedi; focused başarı genel typecheck başarısı olarak sunulmaz.

AT32 PARTIAL; AT35 bu açık-editor senaryosu için yerel kanıtla genişledi. İki hafta/lokasyon swap, 30 latency örneği, gerçek reconnect/offline süreleri, insan UI/UX kabulü ve hosted/pilot hâlâ açık. Yeni migration/deploy yapılmadı; manager oturumu korunur.
