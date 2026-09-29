# Delegasyon — işi kim yapar, kim bakar

Kullanıcı kararı 2026-09-29: "Her implementasyondan sonra işi test, db, görsel QA, güvenlik ve
arayüz oturumlarına paslayıp üzerinden geçirmek zorunda değilsin; bu çok zaman kaybettiriyor.
Yalnız gerektiğinde yardım al ya da görev delege et." Bu dosya o kararın nasıl uygulanacağını
yazar. `CLAUDE.md` ile birlikte okunur; ikisi çelişirse inceleme ve delegasyon konusunda bu dosya
geçerlidir.

## 1. İlke
- **Kalite çıtası değişmez** (`CLAUDE.md` §9: tenant güvenliği, testler, erişilebilirlik, tasarım
  kuralları). Değişen şey çıtanın kimin eliyle ve kaç kez kontrol edildiğidir.
- **Varsayılan: koordinatör kendisi yapar ve kendisi doğrular.** Bir role pas, getirisi
  maliyetinden açıkça büyükse verilir. "Kurala göre hep böyle yapılıyor" pas gerekçesi değildir.
- **Otomatik kontrol, insan-benzeri incelemeden önce gelir.** Bir hatayı bir test, typecheck,
  pgTAP ya da e2e yakalayabiliyorsa önce o koşulur. İnceleme, testin göremediği şey için istenir.
- **Tek bağımsız göz yeter;** aynı diff'i iki incelemeciye göndermek yalnız R3'te yapılır.

## 2. Bir pasın maliyeti ve getirisi (bu projede ölçülen)
| | Maliyet | Getiri |
|---|---|---|
| Alt ajan incelemesi (`nf-guvenlik`, `/code-review`) | 5–15 dk + raporu okuma | Yazanın görmediğini bulur: BL-218.3'te `/code-review max` 14 bulgu, `nf-guvenlik` kaçırılmış ikiz okumayı buldu |
| Görsel QA (`nf-gorsel-qa`) | 10–15 dk, iki dev sunucusu (makine yükü) | Telefon genişliği, tutarlılık, WCAG; ekranın kendisi teslim edilen şeyse gerekli |
| Rol oturumuna görev (işçi oturumu) | 15–60 dk tur, kullanıcının tıklaması, bağlam kurulumu | Uzun ve çok adımlı işi paralel yürütür, koordinatörün bağlamını korur |
| `nf-planlama` kayıt/ölçüm | 5–10 dk | Koordinatörün bağlamını korur; küçük kayıtta getirisi yok |
| Her pas için ortak | Koordinatör bağlamı, bekleme, makine yükü (CI aynı PC'de) | — |

## 3. Risk sınıfı (her iş başında bir kez belirlenir)
Sınıf, değişikliğin **en riskli parçasına** göre verilir.

- **R0 — belge ve kozmetik.** Docs, yorum, metin düzeltmesi, token değeri, derleyicinin
  koruduğu yeniden adlandırma, yalnız test dosyası.
  → Yazan: koordinatör. İnceleme: yok. Kontrol: ilgili hızlı kapı (lint/typecheck ya da tek
  vitest). Ekranda görünüyorsa koordinatörün tek ekran görüntüsü.
- **R1 — tek ekranda sınırlı değişiklik.** Tek ekranın görünümü/davranışı, paylaşılan sözleşmeye
  (shared şema, API şekli, DB fonksiyonu) dokunmuyor, kolay geri alınır.
  → Yazan: koordinatör (ya da işin uzmanlığı gerektiriyorsa rol alt ajanı). İnceleme: koordinatörün
  kendi diff okuması + tam kapı. Görsel: koordinatör ekran görüntüsü alır (masaüstü + telefon);
  `nf-gorsel-qa` yalnız ekran teslim edilen şeyin kendisiyse (yeni tasarım, yeniden düzenleme).
- **R2 — paylaşılan parça.** Shared şema/tip, API cevap şekli, okuma fonksiyonu (yetkisiz),
  birden çok ekrana yayılan değişiklik, yetkiye dokunmayan migration.
  → Yazan: ilgili rol ya da koordinatör. İnceleme: **tek** bağımsız inceleme — `nf-guvenlik` ya da
  `/code-review`, ikisi değil. Tam kapı + etkilenen e2e. Görsel QA, ekran birden fazla yerde
  değiştiyse.
- **R3 — riskli yüzey.** Yetki, RLS, grant, `*_service` sınıflandırması, katılım/davet, sahiplik
  devri, veri silme, hosted DDL gerektiren sözleşme değişikliği, parola/oturum.
  → Yazan: ilgili rol (`nf-db` / `nf-backend`). İnceleme: `nf-guvenlik` **zorunlu**; büyük diff'te
  ek olarak `/code-review` ve kullanıcıya ultrareview önerisi (`CLAUDE.md` §5). Tam kapı + `test:db`
  + etkilenen e2e. Ekran değiştiyse `nf-gorsel-qa`.

Belirsizse bir üst sınıf seçilir ve nedeni tek satırla yazılır.

## 4. Karar adımları (pas vermeden önce sırayla)
1. **Sınıf ne?** (R0–R3, en riskli parçaya göre.)
2. **Bu hatayı otomatik bir kontrol yakalar mı?** Evet → önce o koşulur; incelemeye yalnız testin
   göremediği soru gider (ör. "başka workspace'in verisi sızıyor mu").
3. **Pasın bulacağı hata ne kadar olası, main'e ya da kullanıcıya ulaşırsa bedeli ne?** Yüksek
   olasılık × yüksek bedel → pas. Düşük × düşük → kendin. Arada → tek bağımsız göz.
4. **Pas bağımsızlık mı getiriyor, yoksa aynı şeyi ikinci kez mi kanıtlıyor?** İkinci kanıt
   verilmez (aynı diff'e iki inceleme, testin kanıtladığını elle yeniden doğrulatma).
5. **Kim?** Kısa iş (≤ ~30 dk) → alt ajan; uzun, çok adımlı iş → işçi/rol oturumu; tek dosyalık,
   uzmanlık tuzağı olmayan iş → koordinatör.
6. **Kararı yaz:** görev mesajında ve kullanıcı raporunda tek satır —
   "Delegasyon: R2; inceleme `nf-guvenlik` (shared şema zorunlu alan), görsel QA yok (ekran değişmedi)."

## 5. Örnekler (bu projeden)
- Metinde yazım hatası, bir butonun rengi token'la → **R0**: koordinatör düzeltir, typecheck +
  tek ekran görüntüsü. Pas yok.
- BL-142 (yalnız CSS, tek ekran) → **R1**: koordinatör yapar, ekran görüntüsü masaüstü + telefon;
  `nf-guvenlik` gereksiz (veri/yetki yok).
- Schedule sağ üst pencereler (stil B, 7 dosya, yalnız görünüm) → **R1/R2**: görsel QA gerekli
  (teslim edilen şey ekranın kendisi); güvenlik incelemesi gereksiz.
- BL-316 (okuma projeksiyonuna eksik `conflict_severity` anahtarı; yetki yok) → **R2**: `nf-db`
  ya da koordinatör migration yazar, rolled-back deneme + ilgili pgTAP + zod parse; tek bağımsız
  inceleme (`/code-review` yeter).
- BL-218.3 (shared şemada zorunlu alan + 4 migration + kayıt kuralı) → **R3**: `nf-guvenlik` +
  `/code-review max` + görsel QA — 14 bulgu çıktı, pas maliyetini fazlasıyla karşıladı.
- FB-6.2.x (izin/RLS) → **R3**: `nf-db` yazar, `nf-guvenlik` zorunlu.

## 6. Yapılmayacaklar
- Törensel pas: sınıfı R0/R1 olan işi "kural böyle" diye incelemeye göndermek.
- Aynı diff'i hem `nf-guvenlik`'e hem `/code-review`'a (R3 dışında).
- 10 dakikalık iş için rol oturumu açtırmak.
- Görsel QA'yı, ekranı değişmeyen işe istemek.
- Bir rolün raporunu koordinatörün kendi kontrolünün yerine koymak: iddia edilen commit ve CI
  koşusu yine bağımsız kontrol edilir (`CLAUDE.md` §11.6).
- Sınıfı düşük göstermek için işi parçalamak; sınıf, main'e girecek toplam değişikliğe göre verilir.
