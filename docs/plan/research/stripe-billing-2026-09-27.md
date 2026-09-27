# Faturalama (Stripe) ve ABD fiyatlandırma araştırması (2026-09-27)

Hazırlayan `nf-planlama` (BL-059, koordinatörün görevi). Web araştırması iki alt ajanla yapıldı; her rakam kaynağında **2026-09-27** tarihinde okundu. Kaynaksız rakam yok; bulunamayan "bulunamadı" diye yazıldı. Rakip metni kopyalanmadı. Bu not karar değildir; kararlar kullanıcıya (görev dosyası `docs/plan/tasks/BL-059.md` "Açık sorular").

## 1. Repoda bugün ne var (`origin/main` `bee7713d`)
- `public.workspace_entitlements` (`supabase/migrations/20260908180000_owner_onboarding_trial_entitlement.sql:26-45`): workspace başına tek satır; durumlar `trialing, active, past_due, soft_locked, cancelled, expired`; sağlayıcı `internal | stripe`; `provider_customer_id`, `provider_subscription_id`, `billing_owner_user_id`, `cancelled_at`, `cancellation_reason` alanları hazır.
- Kurulum tamamlanınca 14 günlük deneme satırı yazılıyor (`supabase/migrations/20260925180000_the_owner_gives_a_legal_name.sql:356-381`, `interval '14 days'`, sağlayıcı `internal`). Yerel DB'de 98 satır, hepsi `trialing`.
- **Deneme bitince hiçbir şey olmuyor:** `apps/api`, `apps/web`, `packages/shared`'de bu tabloyu okuyan kod yok (grep 2026-09-27). Kilitleme, uyarı, ödeme ekranı yok.
- **İkinci deneme engeli yok:** aynı owner'ın yeni workspace'i de 14 gün alıyor; ROADMAP "Kapsam kararları" bunu yasaklıyor ("daha önce trial kullanmış owner yeni workspace açınca tekrar trial alamaz").
- Ürün kuralı: billing yalnız owner'ın (REUSE "Roller ve kapsam" `:36`); faturalama sahipliği devirle geçiyor (`sync_workspace_entitlement_billing_owner_trigger`).
- Stripe kodu, hesabı, anahtarı yok.

## 2. Rakipler (ABD, resmi fiyat sayfaları, 2026-09-27)
| Ürün | Birim | En ucuz ücretli plan (aylık fatura / yıllık) | Ücretsiz plan | Deneme | Deneme sonu | Kaynak |
|---|---|---|---|---|---|---|
| 7shifts | lokasyon/ay | Essentials $44.99 / $39.99; Pro $89.99; Premium $149.99 | 1 lokasyon, ≤15 çalışan | 14 gün, kart yok | ücretsiz plana geç ya da kart gir; ikisi de yoksa hesap sona erer | https://www.7shifts.com/pricing |
| Homebase | lokasyon/ay | Essentials $30 / $24; Plus $70; All-in-One $120 | 1 lokasyon, ≤10 çalışan | 14 gün, kart yok | ücretsiz plana otomatik düşer (sınırı aşan ücretli seçmeli) | https://joinhomebase.com/pricing |
| When I Work | kullanıcı/ay | tek lokasyon $2.50; çok lokasyon $5.00 | yok | 14 gün, kart yok | bulunamadı | https://wheniwork.com/pricing |
| Deputy | kullanıcı/ay | Lite $5.50 / $5; aylıkta en az $30/fatura | bulunamadı | en çok 31 gün, kart yok | bulunamadı | https://www.deputy.com/pricing, https://www.deputy.com/features |
| Sling (Toast) | kullanıcı/ay | Premium $2.00 / $1.70; Business $4.00 | ≤30 kullanıcı | 15 gün | devam için kart gerekir | https://getsling.com/pricing, https://getsling.com/terms-of-service/ |
| Toast | POS paketiyle | ayrı çizelge fiyatı bulunamadı; POS + Payroll $69/ay + $9/çalışan | — | bulunamadı | — | https://pos.toasttab.com/pricing |
| Square | lokasyon/ay | Plus $49 (Shifts dahil), Premium $149 | Square Free (Shifts kapsamı bulunamadı) | 30 gün | bulunamadı | https://squareup.com/us/en/pricing |

Ortak kalıplar: restorana odaklananlar **lokasyon başına** fiyatlıyor ($30–$49/lokasyon/ay giriş, aylık fatura); genel vardiya araçları kullanıcı başına ($2–$5.50/kullanıcı/ay). Deneme **14 gün** ve **kart istemeden** yaygın. Ücretsiz planı olanlar deneme sonunda ücretsiz plana düşürüyor, sessizce ücret çekmiyor. İptal her yerde "her an", kısmi ay iadesi yok. Vergiyi açıkça "hariç" yazanlar Deputy ve Sling. Sayfalarda kampanyalar var; fiyatlar değişebilir.

## 3. Stripe maliyeti (2026-09-27)
| Kalem | Ücret | Kaynak |
|---|---|---|
| ABD kartı | %2,9 + $0,30 / başarılı ödeme; yabancı kart +%1,5; kur çevrimi +%1 | https://stripe.com/pricing |
| Stripe Billing (kullandıkça öde) | fatura hacminin %0,7'si; aylık ücret ve asgari yok | https://stripe.com/billing/pricing |
| Billing sözleşmeli planlar | $620/ay'dan başlıyor (1 yıl, aylık hacim ≤$100k) — lansman için anlamsız | https://stripe.com/billing/pricing |
| Müşteri portalı | Billing'e dahil; kendi alan adında $10/ay | https://stripe.com/billing/pricing |
| Checkout | ayrı ücret bulunamadı (açık "ücretsiz" ifadesi de bulunamadı) | https://stripe.com/pricing |
| Invoicing | ödenen fatura başına %0,4, en çok $2 — **abonelik faturalarına Billing'in %0,7'sinin üstüne ekleniyor mu doğrulanmadı** | https://stripe.com/pricing |
| Stripe Tax (Checkout/Billing ile) | kayıtlı olunan eyaletlerdeki işlem başına %0,5 | https://stripe.com/tax/pricing |
| Stripe Tax Complete (beyanname dahil) | $90/ay'dan (1 yıl; 2 kayıt, 200 işlem, yılda 4 beyan) | https://stripe.com/tax/pricing |
| İtiraz (chargeback) | $15 + elle yanıt verilirse $15 | https://stripe.com/pricing |

**Örnek hesap (lokasyon başı $39/ay varsayımıyla; fiyat kullanıcı kararı):** kart $1,43 + Billing $0,27 + (vergi kaydı olan eyaletteyse) Tax $0,20 = **~$1,90 / lokasyon / ay (~%4,9)**. Invoicing'in %0,4'ü ekleniyorsa +$0,16. Sabit aylık Stripe ücreti yok; Tax Complete seçilirse +$90/ay.

## 4. ABD satış vergisi (SaaS)
- Stripe'a göre 25 eyalet SaaS'ı vergilendiriyor, 7'si yalnız indirilen yazılımı (https://stripe.com/guides/introduction-to-saas-taxability-in-the-us, sayfa güncellemesi 2025-11-24).
- TaxJar'ın listesi (güncelleme 2026-04-24; başlık 27 eyalet diyor, çıkarılan ad 24): AL, AK (yalnız yerel), AZ, CT, HI, IA, KY, LA, MD, MA, NM, NY, OH, PA, RI, SC, SD, TN, TX (bedelin %80'i), UT, VT, WA, DC, WV (https://www.taxjar.com/sales-tax/saas-sales-tax). **Tam liste sayfadan elle okunmalı.**
- Değişenler: **Kaliforniya 2027-01-01'den itibaren SaaS'ı vergilendirecek** (SB 122, 2026-06-29 imzalandı; https://www.avalara.com/blog/en/north-america/2026/06/california-sales-tax-software-saas.html). Utah 2026-07-01'den beri (SB 162; https://le.utah.gov/~2026/bills/static/SB0162.html).
- Ekonomik bağ (nexus) eşiği: çoğunda yıllık $100.000 satış (işlem sayısı şartı birçok eyalette kalktı); CA ve TX $500.000; NY $500.000 ve 100 işlem; AL, MS $250.000 (https://stripe.com/resources/more/sales-tax-nexus-laws, güncelleme 2026-07-21).
- **Stripe, eyalete kayıt olunmadan vergi hesaplamaz ve toplamaz.** Kayıt işletmenin kendisinin (Stripe ana eyalet dışında kaydı yapabilir); nerede kayıt olunacağına vergi danışmanı karar verir (https://docs.stripe.com/tax/registering). Lansmanda satış eşikleri çok uzak; asıl soru şirketin kendi eyaleti (fiziksel bağ).

## 5. Önerilen Stripe yapısı (karar değil; `stripe:stripe-best-practices` rehberiyle)
- **Checkout Sessions (abonelik modu) + Billing + Müşteri portalı**; kendi ödeme formu yazılmaz. Deneme: `subscription_data.trial_period_days=14`. Kart istemeden deneme için `payment_method_collection=if_required` ve deneme sonunda kart yoksa `trial_settings.end_behavior.missing_payment_method = cancel | pause` (https://docs.stripe.com/payments/checkout/free-trials.md).
- **Tuzak:** portal varsayılanında denemedeyken yapılan değişiklik denemeyi bitirip hemen ücret çeker; `features.subscription_update.trial_update_behavior=continue_trial` gerekir (https://docs.stripe.com/customer-management).
- **Webhook'lar zorunlu:** `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `customer.subscription.trial_will_end` (bitişten 3 gün önce), `invoice.paid`, `invoice.payment_failed`, `invoice.payment_action_required`, `invoice.finalization_failed` (Tax adres bulamazsa), `charge.dispute.created`; `pause` seçilirse `customer.subscription.paused` (https://docs.stripe.com/billing/subscriptions/webhooks). Erişim `invoice.paid` ile verilir/uzatılır; `canceled` ya da `unpaid`'de kalkar.
- **İptal:** dönem sonunda (`cancel_at_period_end`), dönem bitene kadar geri alınabilir (https://docs.stripe.com/billing/subscriptions/cancel). Plan değişikliğinde varsayılan orantılı hesap bir sonraki faturaya yazılır; düşüşte iade yok (https://docs.stripe.com/billing/subscriptions/prorations).
- **Tahsilat:** Smart Retries önerilen varsayılan 2 haftada 8 deneme; son denemeden sonra abonelik iptal / ödenmemiş / `past_due` (panel ayarı) (https://docs.stripe.com/billing/revenue-recovery/smart-retries).
- **Anahtar:** kısıtlı API anahtarı (`rk_`); geliştirme ve CI için ayrı Stripe sandbox'ları (Stripe rehberi). Hesap açmak ve anahtar işlemleri kullanıcı onayı ister (CLAUDE.md §8).
- **Uygulamayla eşleme:** Stripe durumu `workspace_entitlements`'a webhook'la yazılır (tek kaynak Stripe, satır ayna); `trialing → active / past_due / soft_locked / cancelled / expired`. Lokasyon başı fiyatta `quantity` = aktif lokasyon sayısı, lokasyon eklenip silindikçe güncellenir.

## 6. Doğrulanmayanlar
Checkout'un ayrı ücreti; abonelik faturalarına Invoicing %0,4'ünün eklenip eklenmediği; TaxJar'ın tam eyalet listesi (27'nin 24'ü çıkarıldı); Utah oranı; Square Free'de Shifts kapsamı; Toast'ın ayrı çizelge fiyatı. Stripe'ın kendi dokümanı vergi kaydı için danışman öneriyor.
