# AT22 — Kaynak yerleşimi ve ek çalışma

**Kısmi yerel kanıt:** Aynı vardiyaya bağlı Line Up yerleşimleri ikinci iş olarak sayılmadı. Sonradan eklenen çalışma, önceden geçerli manager onayını engelledi. Native ek atama ve eski bağımsız Line Up satırı ayrı sınandı. Geçiş süresinin ortak kurala bağlanması henüz uygulanmadığından AT22 PARTIAL kalır.

Ayrı owned workspace: `aa47b0b7-9003-49b8-a14b-af58e51bdf39`. Önceki helper'ın availability/cover hazırlığı bu iki swap sonucuna ek başarı olarak sayılmaz.

## Kaynak yerleşimini iki kez saymama

İki çalışan, aynı gün aynı saatlerde iki ayrı lokasyonda yayımlanmış vardiyalara sahiptir. Manager gerçek `/schedule/lineups/entries` API'si ile her vardiyaya station yerleşimi ekler. Swap aday aramasında iki published shift çıkarıldıktan sonra kendi source-linked overlay'leri çalışanları hâlâ meşgul saymamalıdır.

Gerçek employee create → peer accept → iki taraf eligible manager preview → final başarılı. İki atama birlikte değişir. Son okumada iki overlay yeni çalışana bağlıdır ve **QA source station** korunur.

## Açık takas sırasında ek çalışma

İkinci takasta owner'ın 09:00–11:00 vardiyası, Casey'nin ertesi günkü 09:00–11:00 vardiyasıyla takas edilmek üzere kabul edilir. Önceki preview geçerlidir.

1. Manager gerçek Line Up **assign** komutuyla Casey'ye ilk gün 09:30–10:30 ek çalışma verir. İşlem published shift ve bağlı overlay oluşturur. Swap eşleşmesi gizlenir; manager preview overlap nedeniyle engellenir; önceki fingerprint ile gerçek final **409** döner. İki owner aynı kalır.
2. Manager aynı ek işi gerçek Line Up **release** komutuyla kaldırır. Ek shift açık pozisyon olarak kalır; eski takas tekrar uygun hale gelir.
3. Aynı aralıkta eski sürümlerden gelebilen `source_shift_id=null` bağımsız çalışma satırı fixture SQL ile hazırlanır. Yeni çalışma yaratmak için eski entries API'si zorlanmaz; mevcut API bunun için assignment operation ister. Legacy satır da aday araması/preview/final üzerinde overlap engeli oluşturur ve final **409** döner.
4. Manager mevcut satırı gerçek entry update API'si ile gizler. Bu legacy satır, mevcut evaluator'ın `hidden=false` aktif çalışma kuralına göre artık çakışma oluşturmaz. Takas tekrar uygun olur; normal manager final iki atamayı birlikte değiştirir. Legacy kayıt silinmez.

[API raporu](matrix.json): **2 completed / 2 transfer / açık case0**, native extra açık pozisyona döndü, legacy extra hidden, **4 kaynak yerleşimi doğru yeni owner ve aynı station ile korundu**. Son tekrar `new_swaps=0`; devirler tekrar yapılmış sayılmaz.

İlk native release denemesinde verifier source-entry yerine published-shift ID gönderdi; API kaynak bulunamadığı için işlemi reddetti. Oluşturulmuş overlay ID'si DB'den doğrulanarak kullanıldı. Mevcut case/assignment/audit korunarak devam edildi; ikinci bir extra yaratılmadı. Bu ara durumda extra aktif olduğundan yeni uygun baseline uydurulmadı; kayıtlı consent fingerprint ile kontrol sürdü.

Bu matris entrypoint olarak swap candidate listing, create/accept pozitif yolu, manager preview ve stale finali kapsar. Extra durumunun tüm pool/peer negatif kombinasyonları veya browser görsel akışı bu tur yürütülmedi. Önceki UI veya Line Up testleri yeniden çalıştırılmış sayılmaz. Ürün kodu/migration değişmedi; güncel API bundle ve gerçek Auth/HTTP kullanıldı. Legacy fixture hazırlığı ve son veri kontrolü SQL'dir.

## Açık geçiş süresi kararı

Mevcut Line Up `travel_minutes` değerini işlem sırasında alır; Shift Hub aynı evaluator'ı bu argümanı vermeden çağırır ve varsayılan **0** kullanır. Şirket genelinde ortak, kayıtlı bir minimum süre yoktur. Bu nedenle travel kriteri tamamlandı olarak işaretlenmedi.

Kullanıcıya başlangıç değeri soruldu. Yanıt gelmediği noktada çalışma varsayımı, **manager tarafından değiştirilebilir ortak ayar, ilk değer 0 dakika**dır; bu kullanıcı tarafından onaylanmış bir 30/60 dakika kuralı değildir. [Sonraki uygulama sözleşmesi](../../shift-hub-transition-policy-contract-2026-09-07.md) bu açığı ve doğrulama kapılarını tanımlar; henüz uygulanmış sayılmaz.

[Kaynak/runtime ve DB function manifesti](source-sha256.json). Credentials yalnız ignored state'te; diğer workspace'ler korunur. Native ve legacy çalışma bu fixture'da artık aktif engel değildir, case/audit geçmişi saklanır. Hosted/deployment veya gerçek insan UAT yapılmadı; genel goal aktif.
