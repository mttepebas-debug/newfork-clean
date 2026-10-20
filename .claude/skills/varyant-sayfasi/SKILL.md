---
name: varyant-sayfasi
description: Bir ekran ya da ekran parçası için görsel varyant sayfası kurar - Orijinal ile en iyi yöntemlere göre tasarlanmış varyantlar, tek etkileşimli Artifact (HTML/JS) sayfada, masaüstü ve telefon yan yana, rol ve olay denemeli. Kullanıcı "varyant", "varyasyon", "mockup", "görsel karar", "bu ekran nasıl olmalı", "design variants" dediğinde kullan.
---

# Varyant sayfası

Kullanıcı bir ekran ya da parça için görsel varyant istediğinde bu adımları sırayla uygula. Kullanıcıyla onun dilinde konuş (Mert'le Türkçe, sade).

## Girdi
- Konu: ekran → bölüm → düğme/çekmece, hangi rol(ler).
- Kullanıcının neyi beğenmediği ya da neyi istediği.
- Varyant sayısı; verilmezse 3.

## Adımlar

1. **Konuyu daralt.** Tam yer, rol(ler) ve çözülecek şey tek cümle. Aynı konu daha önce çalışılmış mı bak (proje kararları, eski varyant klasörleri, oturum özetleri). Daha önce reddedilen yaklaşımı tekrar önerme.

2. **Orijinal'i gerçek koddan kur.** Bugünkü hâl, uygulamanın kodundan ve örnek veriyle çalışır; elle çizim değil. Hangi sürümden kurulduğunu not dosyasına yaz. Orijinal karşılaştırma içindir, doğru kabul edilmez.

3. **Önce araştır, sonra tasarla.** Hedef en iyi çözüm, bugünkü ürüne yama değil.
   - Bu işin iyi ürünlerde ve kabul görmüş tasarım kılavuzlarında nasıl çözüldüğüne kısaca bak. Rakipler yalnız referanstır, kopyalanmaz.
   - Akış, bilgi mimarisi, işleyiş, etkileşim, UI ve UX baştan düşünülür. Her varyant farklı bir yaklaşımdır, küçük bir ayar farkı değil.
   - Sabit kalan yalnız tasarım dili: projenin fontları ve renk değişkenleri, tema, düğme renk rolleri, erişilebilir kontrast. Yeni renk ya da font icat edilmez. Sayfalar yeşilse varyant mavi olmaz.

4. **Tek etkileşimli sayfa kur (Artifact, HTML/JS).**
   - Orijinal + A, B, C arasında geçiş.
   - Masaüstü 1440 ve telefon 390 yan yana ve eşzamanlı; isteğe bağlı alt alta düzen düğmesi.
   - Düğmeler, çekmeceler, pencereler, üzerine gelme, geçişler gerçekten çalışır.
   - Rol değiştirici: farklı rollerin farklı olayları denenebilir (ör. yönetici onaylar, çalışan talep gönderir).
   - Örnek durumlar: boş, yükleniyor, hata, uzun ad, çok kayıt, yetkisiz.

5. **Her varyantın altına sade açıklama yaz:**
   - Ne farklı.
   - Neden daha iyi: hangi yaygın yönteme ya da ürün örneğine dayanıyor.
   - Seçilirse ne gerektirir: yalnız ekran mı, veri / API / yetki değişikliği de mi; başka hangi ekranlar etkilenir.
   - Çıplak plan ya da karar numarası yazma; gerekiyorsa cümle sonunda parantez içinde.

6. **Kendin kontrol et.** Masaüstü ve telefon ekran görüntüsü al, bak: taşma, kesilen yazı, okunmayan renk, çalışmayan düğme varsa düzelt.

7. **Yayınla.** Artifact olarak yayınla. Aynı konunun yeni turu aynı bağlantıya yeni sürüm olur, yeni bağlantı açılmaz. Günlük yayın sınırını gözet.

8. **Bir kez bildir.** Bağlantıyı ve sayfaya nasıl bakılacağını tek mesajla yaz. "Hangisini yapayım?" sorusu ya da karar kartı gönderme: görsel seçimde Claude'un önerisi zayıf dayanaktır, seçimi kullanıcı sayfayı deneyerek yapar ve kendisi yazar. (Varyant dışındaki sorular projenin soru kuralına göre sorulur.)

9. **Yorum gelirse yeni tur.** Aynı sayfaya "Tur 2" olarak eklenir; yorum ve tarih not dosyasına yazılır.

10. **Seçim gelince kaydet, koda geçme.** Seçimi not dosyasına ve projenin karar kaydına yaz (seçilen ve reddedilen varyantlarla). Seçim ortak bir değeri (boşluk, font, düğme biçimi) değiştiriyorsa kural önce karar kaydına yazılır, uymayan ekranlar adıyla söylenir. Kodlama kullanıcının ayrıca "kodla" demesiyle ayrı iş olarak başlar.

## Yapma
- Kod commit'i, main'e dokunma, kullanıcıya git ya da komut sorusu.
- İş bitince sayfa belgelemesi ya da uygulama sayfalarını Artifact olarak yazma; yalnız istenen varyant sayfası.

## Newfork projesinde (newfork-clean)
- Tasarım dili: `apps/web/src/styles.css` (`--theme-*`); yalnız açık tema; aksiyon yeşil, vazgeç beyaz, yıkıcı iki tık kırmızı; tarayıcı diyaloğu yok.
- Orijinal: bilgisayarda çalışan gerçek uygulama.
- Dosyalar: `C:\Users\TheWe\Documents\Codex\newfork-pages\hesap-devri-2026-10-14\proje-dosyalari\pages\gorsel-kararlar\gelen\<konu>\` (sayfa, `README.md`: Orijinal'in kaynak sürümü, tarih California saatiyle, her varyant bir satır, turlar; görüntüler). Aynı ekranın işi o ekranın var olan Artifact'ında sürer.
- Kurallar: repo `CLAUDE.md` geçerlidir; bu skill onunla çelişirse o kazanır.
