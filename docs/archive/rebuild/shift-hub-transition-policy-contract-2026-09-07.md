# AT22 — Ortak minimum geçiş süresi: sonraki uygulama sözleşmesi

Durum: **AT22 çekirdek yerel kabul tamamlandı (LOCAL)**. Ortak minimum, tüm temel Exchange kapıları, iki taraflı takas, gerçek policy/final yarışları ve Line Up move/swap residual kontrolleri kanıtlı. Settings ve Line Up effective süre açıklaması gerçek browser'da kontrol edildi. [Birleşik kabul ve sınırlar](shift-hub-visual-proof-2026-09-07/travel-policy/acceptance-local.md). G05/genel goal, hosted ve native/insan UAT ayrı açık.

Başlangıç çalışma varsayımı: manager'ın Scheduling Settings'te değiştirebileceği workspace ayarı; yeni workspace için 0 dakika. Kullanıcıya 0/30/60 başlangıç seçimi soruldu, henüz yanıt alınmadı. 0, mevcut davranışı koruyan başlangıçtır; daha sonra girilmiş değeri eski istemci payload'ı tekrar 0'a çevirmemelidir.

## Beklenen sonuç

- Manager ortak minimumu 0–240 dakika aralığında belirler. 0 için “No minimum configured” anlamı açık; sayı + dakika birimi + kısa örnekle temiz settings alanı. Employee bu ayarı değiştiremez.
- Ortak evaluator, aynı lokasyondaki komşu vardiyayı seyahat gerektiriyor saymaz. Farklı lokasyonlarda UTC aralıklarını minimum süreyle kontrol eder; tam sınırda biten half-open aralık geçerlidir.
- Effective süre `max(workspace minimum, explicit Line Up operation travel)` olur. Published vardiyalar ve aktif bağımsız günlük atamalar kapsanır. Aynı source-linked placement ikinci iş sayılmaz.
- Line Up kısmi move/swap'ın ayrılmış geçiş boşlukları da effective süreyi kullanır. Sadece eligibility check'e minimum ekleyip commit sırasında eski 0 ile residual shift üretmek kabul edilmez.
- Manager preview, kullanılan effective süreyi açıklar. Formda 0 görünürken gizlice 30 dakika uygulamak yerine şirket minimumu görünür olmalıdır. Mevcut operasyonun daha yüksek explicit değeri azaltılmaz.
- Shift Hub list/submit/peer consent/preview/final aynı minimuma tabidir. Eksik süre için gerekçe açık, final engelli, owner aynı. Genel takvim mahremiyeti korunur.
- Settings write ile final transaction ortak yarış korumasını paylaşır. Finalden sonra girilen yeni kural, tamamlanmış atamayı geçmişe dönük sessizce iptal etmez.
- Availability gibi uygunluk politikası, shift'in maddi koşullarından ayrı ele alınır: gereksiz yeni peer rızası üretilmez; final her zaman güncel minimumla yeniden değerlendirilir.

## Ölçülebilir kabul

1. Ayar 30: farklı lokasyonda 15 dakika boşluk tüm ilgili kapılarda engelli; 30 dakika sınırı uygun. Aynı lokasyon kontrolü yanlış engel üretmez.
2. Workspace30 + operation60 → effective60; workspace60 + operation30 → effective60. Preview etkileri ve commit edilen residual aralıklar aynı değeri kullanır.
3. Aktif bağımsız extra için travel kontrolü; hidden/call-off ve source-linked duplicate davranışı mevcut aktif-atama sözleşmesiyle tutarlı.
4. Eski settings payload'ı alanı göndermeyince mevcut30 korunur. Yetkisiz employee write403; farklı workspace değeri okunamaz/değiştirilemez. Ayar audit'inde doğru actor ve workspace görünür.
5. Açık geçerli manager preview sonrası minimum artınca yetersiz aralık için final409, owner ve özel not korunur. Gerçek API race iki sırada doğrulanır; yarım devir yok.
6. Scheduling Settings ve Line Up effective süre açıklaması 390/1440, light/dark ve klavye ile kullanılabilir; Shift Hub ilgili hata okunabilir. Gerçek insan UAT ayrıca açık kalır.

İlgili kaynaklar: `apps/web/src/settings/SchedulingSettingsPage.tsx`, `apps/api/src/settings/organization-settings-service.ts`, ortak scheduling settings şemaları, `lineup_candidate_check` ve Line Up preview/commit RPC'leri. Migration `20260909032000_shift_exchange_shared_travel_policy.sql`, mevcut dirty worktree ve güncel fonksiyonlar doğrulandıktan sonra eklendi. Yetki mevcut `workspace.manage` kapsamıdır; her manager bu global ayarı değiştiremez. Gerçek API kanıtındaki yönetici bu yetkiye sahip QA admin'dir. Bu uygulama tek başına AT22/G05'in tüm kapılarını tamamlamaz.
