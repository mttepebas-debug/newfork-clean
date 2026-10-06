# Delegasyon — işi kim yapar, kim bakar

Kullanıcı kararı 2026-09-29: "Her implementasyondan sonra işi test, db, görsel QA, güvenlik ve
arayüz oturumlarına paslayıp üzerinden geçirmek zorunda değilsin; bu çok zaman kaybettiriyor.
Yalnız gerektiğinde yardım al ya da görev delege et."

Kullanıcı kararı 2026-10-06 (Mert, koordinatörün penceresinde): "koordinatör olarak bu sessionda
bir daha asla işçi olarak çalışmanı istemiyorum. Sadece plan yapacaksın, logları tutacaksın,
ilerlemeyi takip edeceksin, diğer sessionlara taskleri delege edeceksin, do ve don'tsları
belirleyeceksin, mvpye hazırlık yapacaksın, dokümantasyon yapacaksın." Aynı turda üç seçim:
koordinatör alt ajan çağırmaz; main'e işi yapan oturum gönderir; ayrıntılı görev dosyasını
planlama oturumu yazar, koordinatör onaylar. Bu karar 09-29'daki "koordinatör kendisi yapar"
varsayılanını ters çevirdi.

Bu dosya iki kararın nasıl uygulanacağını yazar. `CLAUDE.md` ile birlikte okunur; ikisi
çelişirse inceleme ve delegasyon konusunda bu dosya geçerlidir.

## 1. İlke
- **Kalite çıtası değişmez** (`CLAUDE.md` §9: tenant güvenliği, testler, erişilebilirlik, tasarım
  kuralları). Değişen şey çıtanın kimin eliyle ve kaç kez kontrol edildiğidir.
- **Koordinatör işçi değildir.** Kod yazmaz; test, ölçüm, kapı ve dev sunucusu koşturmaz; ekran
  görüntüsü almaz; alt ajan çağırmaz. Her iş, ne kadar küçük olursa olsun, bir oturuma verilir.
  Koordinatörün kendi işi: plan, kayıtlar (backlog, kararlar, ilerleme, devir), görev dağıtımı ve
  oturum yönetimi, kurallar, MVP hazırlığı, belgeler. Denetimi hafiftir: raporu okur, iddia edilen
  commit'in main'de ve main CI'ın yeşil olduğunu görür, riskli yüzeyde diff'i okur.
- **İnceleme ve görsel QA da oturumda koşar.** İşi yapan oturum kendi alt ajanını
  (`nf-guvenlik`, `nf-gorsel-qa`, `/code-review`) çağırabilir; R3'te bağımsızlık için inceleme
  ayrı bir oturuma verilebilir. Sonuç rapora yazılır, koordinatör raporu okur.
- **Bir role pas, işin sınıfına göre verilir;** "kurala göre hep böyle yapılıyor" pas gerekçesi
  değildir. Aynı oturum işi yazar ve sınıfın istediği kadar kendi kontrolünü yapar.
- **Otomatik kontrol, insan-benzeri incelemeden önce gelir.** Bir hatayı bir test, typecheck,
  pgTAP ya da e2e yakalayabiliyorsa önce o koşulur. İnceleme, testin göremediği şey için istenir.
- **Tek bağımsız göz yeter;** aynı diff'i iki incelemeciye göndermek yalnız R3'te yapılır.

## 2. Bir pasın maliyeti ve getirisi (bu projede ölçülen)
| | Maliyet | Getiri |
|---|---|---|
| İnceleme (`nf-guvenlik`, `/code-review`) | 5–15 dk + raporu okuma | Yazanın görmediğini bulur: BL-218.3'te `/code-review max` 14 bulgu, `nf-guvenlik` kaçırılmış ikiz okumayı buldu |
| Görsel QA (`nf-gorsel-qa`) | 10–15 dk, iki dev sunucusu (makine yükü) | Telefon genişliği, tutarlılık, WCAG; ekranın kendisi teslim edilen şeyse gerekli |
| Oturuma görev | 15–60 dk tur, bağlam kurulumu | İşi paralel yürütür, koordinatörün bağlamını korur |
| Koordinatörün kendisi yapması | Koordinatör bağlamı (Schedule görev dosyası alt ajanla ~320 bin token) | Yok — 2026-10-06'dan beri yapılmaz |

## 3. Risk sınıfı (her iş başında bir kez belirlenir)
Sınıf, değişikliğin **en riskli parçasına** göre verilir.

- **R0 — belge ve kozmetik.** Docs, yorum, metin düzeltmesi, token değeri, derleyicinin
  koruduğu yeniden adlandırma, yalnız test dosyası.
  → Yazan: havuzdaki bir oturum. İnceleme: yok. Kontrol: ilgili hızlı kapı (lint/typecheck ya da
  tek vitest). Ekranda görünüyorsa oturumun tek ekran görüntüsü. İstisna: koordinatörün kendi
  kayıt ve belge dosyaları (`CLAUDE.md`, bu dosya, `docs/plan` kayıtları) koordinatörde kalır.
- **R1 — tek ekranda sınırlı değişiklik.** Tek ekranın görünümü/davranışı, paylaşılan sözleşmeye
  (shared şema, API şekli, DB fonksiyonu) dokunmuyor, kolay geri alınır.
  → Yazan: ilgili rol oturumu. İnceleme: oturumun kendi diff okuması + tam kapı; koordinatör
  raporu ve diff özetini okur. Görsel: oturum ekran görüntüsü alır (masaüstü + telefon);
  `nf-gorsel-qa` yalnız ekran teslim edilen şeyin kendisiyse (yeni tasarım, yeniden düzenleme).
- **R2 — paylaşılan parça.** Shared şema/tip, API cevap şekli, okuma fonksiyonu (yetkisiz),
  birden çok ekrana yayılan değişiklik, yetkiye dokunmayan migration.
  → Yazan: ilgili rol oturumu. İnceleme: **tek** bağımsız inceleme — `nf-guvenlik` ya da
  `/code-review`, ikisi değil. Tam kapı + etkilenen e2e. Görsel QA, ekran birden fazla yerde
  değiştiyse.
- **R3 — riskli yüzey.** Yetki, RLS, grant, `*_service` sınıflandırması, katılım/davet, sahiplik
  devri, veri silme, hosted DDL gerektiren sözleşme değişikliği, parola/oturum.
  → Yazan: ilgili rol oturumu (`nf-db` / `nf-backend`). İnceleme: `nf-guvenlik` **zorunlu**;
  büyük diff'te ek olarak `/code-review` ve kullanıcıya ultrareview önerisi (`CLAUDE.md` §5).
  Tam kapı + `test:db` + etkilenen e2e. Ekran değiştiyse `nf-gorsel-qa`. Koordinatör diff'in
  riskli kısmını kendisi okur.

Belirsizse bir üst sınıf seçilir ve nedeni tek satırla yazılır.

## 4. Karar adımları (görev vermeden önce sırayla)
1. **Sınıf ne?** (R0–R3, en riskli parçaya göre.)
2. **Bu hatayı otomatik bir kontrol yakalar mı?** Evet → önce o koşulur; incelemeye yalnız testin
   göremediği soru gider (ör. "başka workspace'in verisi sızıyor mu").
3. **İncelemenin bulacağı hata ne kadar olası, main'e ya da kullanıcıya ulaşırsa bedeli ne?**
   Yüksek olasılık × yüksek bedel → bağımsız inceleme. Düşük × düşük → oturumun kendi kontrolü.
   Arada → tek bağımsız göz.
4. **İnceleme bağımsızlık mı getiriyor, yoksa aynı şeyi ikinci kez mi kanıtlıyor?** İkinci kanıt
   istenmez (aynı diff'e iki inceleme, testin kanıtladığını elle yeniden doğrulatma).
5. **Hangi oturum?** Kısa iş → havuzdaki boş oturum (gerekirse önce `/clear`); uzun, çok adımlı iş
   → rol oturumu. Aynı dosyaya iki oturum aynı anda konmaz.
6. **Kararı yaz:** görev mesajında ve kullanıcı raporunda tek satır —
   "Delegasyon: R2; inceleme `nf-guvenlik` (shared şema zorunlu alan), görsel QA yok (ekran değişmedi)."

## 5. Örnekler (bu projeden)
- Metinde yazım hatası, bir butonun rengi token'la → **R0**: havuz oturumu düzeltir, typecheck +
  tek ekran görüntüsü. İnceleme yok.
- BL-142 (yalnız CSS, tek ekran) → **R1**: `nf-arayuz` oturumu yapar, ekran görüntüsü masaüstü +
  telefon; `nf-guvenlik` gereksiz (veri/yetki yok).
- Schedule sağ üst pencereler (stil B, 7 dosya, yalnız görünüm) → **R1/R2**: görsel QA gerekli
  (teslim edilen şey ekranın kendisi); güvenlik incelemesi gereksiz.
- BL-316 (okuma projeksiyonuna eksik `conflict_severity` anahtarı; yetki yok) → **R2**: `nf-db`
  oturumu migration yazar, rolled-back deneme + ilgili pgTAP + zod parse; tek bağımsız inceleme
  (`/code-review` yeter).
- BL-218.3 (shared şemada zorunlu alan + 4 migration + kayıt kuralı) → **R3**: `nf-guvenlik` +
  `/code-review max` + görsel QA — 14 bulgu çıktı, inceleme maliyetini fazlasıyla karşıladı.
- FB-6.2.x (izin/RLS) → **R3**: `nf-db` yazar, `nf-guvenlik` zorunlu.

## 6. Yapılmayacaklar
- Koordinatörün kendisi bir iş yapması: kod, ölçüm, test, kapı, ekran görüntüsü, alt ajan.
  "Tek satırlık" ya da "iki dakikalık" olması istisna değildir.
- Törensel inceleme: sınıfı R0/R1 olan işi "kural böyle" diye incelemeye göndermek.
- Aynı diff'i hem `nf-guvenlik`'e hem `/code-review`'a (R3 dışında).
- Kısa iş için yeni oturum açmak; havuzda boş oturum varsa ona verilir.
- Görsel QA'yı, ekranı değişmeyen işe istemek.
- Bir oturumun raporunu koordinatörün kontrolünün yerine koymak: iddia edilen commit ve CI
  koşusu yine bağımsız kontrol edilir (`CLAUDE.md` §11.6).
- Sınıfı düşük göstermek için işi parçalamak; sınıf, main'e girecek toplam değişikliğe göre verilir.
