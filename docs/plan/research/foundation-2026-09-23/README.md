# Temel kararı: toparlamak mı, sıfırdan kurmak mı? — 2026-09-23

**Soru (kullanıcı):** Rol/erişim (organizasyon vs lokasyon kapsamı), RLS/politikalar, testlerin kararlarla aynı adımda kalması, employee→admin arayüz akışları ve uygunluk kuralları yüzünden kısır döngüde miyiz; ilk mimari/izin kararları çıkmaza mı soktu; sıfırdan doğru bir database/RLS/policy/backend temeli kurmak daha mı iyi? Bir iş arkadaşının yorumu da ("temel sağlam, sorun kuralın tekrar yazılması; tek authorize() + yetki matrisi testi") doğrulanmak üzere verildi.

**Durum:** analiz bitti, **karar verilmedi**. Kullanıcıyla konuşulacak.

**Yöntem:** 14 ajanlı iş akışı (salt okunur; denemeler geri alındı): 6 ölçüm (kimlik zinciri, yetki kuralı sayımı, RLS/politika denetimi, rol kaynağı, test altyapısı, yeniden kurma maliyeti) → 3 seçenek savunucusu (A yerinde toparla / B yetki çekirdeğini yeniden kur, alan alan / C sıfırdan) → 3 hakem (güvenlik, tek kişilik teslim riski, uzun vadeli bakım) → sentez + eksik taraması.

## Dosyalar
| Dosya | İçerik |
|---|---|
| `karar-raporu.md` | Türkçe karar raporu (sentez ajanı). **Eleştiriyle birlikte okunmalı** |
| `elestiri-eksikler.md` | Eksik taraması: raporda kanıtın desteklemediği iddialar, atlanan kanıtlar, cevapsız sorular, iyimser süreler |
| `olcumler.json` | 6 ölçüm araştırmasının tam çıktısı (iddia-kanıt-doğrulama biçimi) |
| `secenek-savunmalari.json` | A/B/C savunmaları (adımlar, süreler, riskler) |
| `hakem-kararlari.json` | 3 hakemin puanları ve koşulları |
| `workflow-betigi.js` | Çalıştırılan iş akışı betiği (tekrar koşmak için) |

## Özet (eleştiri düzeltmeleri işlenmiş)
- Hakem puanları (1–10): A 7/8/6 = 21, **B 8/6/8 = 22**, C 5/2/5 = 12. C üç bakışta da son. A ile B fiilen başa baş; öneri "B′" = B'nin kapsamı, A'nın sırası (önce güvenlik tıkaçları + CI'da veritabanı testleri + yetki matrisi, sonra tek yetki çekirdeği, sonra ikiz sistemlerin silinmesi, sonra alan alan taşıma).
- **Veri modeli sağlam; yetki mimarisi temel düzeyde kusurlu** (eleştiri düzeltmesi): 8 Eylül'deki "tarayıcı → API + service_role" geçişi yarım kaldı (iki erişim kanalı, 45 köprü fonksiyon, ~12–16 kapsam uygulaması). Bu, raporun "kaynağı mimari değil" cümlesinden daha doğru bir ifade.
- İşletmeler arası ayrım veri düzeyinde bir kez delindi: admin tarayıcıdan bir üyeliği başka işletmenin çalışan kaydına bağlayabildi (deney). Düzeltmesi ucuz (bileşik FK + tarayıcı yazma izinlerinin kapatılması).
- Kimlik zinciri (actor_user_id doğrulanmış JWT'den): normal yolların hepsinde doğru; 5 istisna. **Acil kontrol:** hesap servisindeki geliştirme kısayolu yalnız `NODE_ENV!=='production'` ile kapanıyor; Vercel'deki NODE_ENV doğrulanmadı.
- Çıkmaza götüren erken kararlar (eleştiriden): (1) tarayıcıdan PostgREST+RLS ile başlayıp API+service_role'a yarım geçmek; (2) taslak/kilit/oturumun işletme+hafta başına tek kap olması; (3) izin talebinde çalışanın seçtiği tek lokasyon; (4) manager kapsamının ertelemeli tetikleyicilerle beslenen senkron tablo olması (görünüm olarak türetmek daha sağlam); (5) rolün iki yerde tutulması.
- Plan henüz kapsamıyor: web'deki gizle/göster kararları (64 izin kontrolü, 10 rota koruması) ve uygunluk (lokasyon+job+availability) matrisi — ikisi de aşamaya ve süreye bağlanmalı.
- Süreler (A 8,5–15; B 10–17; C 13–22 kişi-hafta) ölçülmüş bir işe dayanmıyor; ilk alan taşınınca yeniden tahmin. B′ boyunca MVP dışı yeni özellik durur (eleştiri: bu süre raporda açıkça yazılmalı).
