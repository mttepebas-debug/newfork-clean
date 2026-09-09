# AT19 — Availability sürümleri ve gerçek cover akışı

Yedi yerel senaryo geçti. Altı availability sürümü gerçek çalışan Auth oturumu ve HTTP komutlarıyla, test haftası yayımlanmadan önce oluşturuldu. Ayrı sahipli workspace: `f16128a0-a7ed-4754-988b-923b394fe417`. Diğer QA çalışma alanları ve eski kanıtlar değiştirilmedi.

## Sonuçlar

| Senaryo | Canonical sonuç | Cover davranışı |
|---|---|---|
| İlk geçerli sürümden önceki gün | unknown / verification_required | Aday ve havuz listesinde yok; pickup ve direct cover 422 |
| Haftalık tam uygunluk | full / allowed | Başvuru, manager preview ve final devir başarılı |
| Geçici tam gün kısıtı; ardından yeni haftalık sürüm | none / blocked | Yeni haftalık kayıt istisnayı silmez; iki başvuru yolu 422 |
| Geçici kısıtın bittiği ertesi gün | full / allowed | Haftalık uygunluk geri gelir; manager onayıyla devir |
| Geçici saatler vardiyanın yalnız bir kısmını kapsıyor | partial / blocked | Full-shift başvurusu iki yolda engelli |
| Tarihli saatlik kısıt; ardından yeni haftalık sürüm | partial / blocked | Saatlik istisna korunur; iki başvuru yolu engelli |
| Tarihli saatlik kısıtın ertesi günü | full / allowed | Doğrudan davet → çalışan kabulü → manager final → devir |

Dört negatif senaryoda owner'ın doğrudan aday listesi ve çalışanın havuz listesi doğru filtrelendi. Zorlanan gerçek HTTP pickup/direct başvurularının sekizi de 422 döndü; application oluşmadı. Case'ler normal owner-close komutuyla kapatıldı. Hata metinleri full-shift uygunluğu şartını belirtiyor; ayrıntılı canonical değerlendirme unknown/none/partial nedenlerini ayrı döndürüyor. Bu nedenlerin tüm çalışan ekranlarında gösterildiği bu tur kanıtlanmadı.

Üç pozitif senaryoda final preview geçerliydi; manager onayından hemen önce yayımlanmış atama hâlâ ilk owner'daydı. Yalnız başarılı final komutu atamayı değiştirdi. İki havuz başvurusu ve bir doğrudan davet/çalışan kabulü kapsandı.

## Yayın sonrası değişiklik girişimi

Geçerli bir başvuru manager kararı beklerken çalışan, o yayımlanmış güne unavailable istisnası göndermeyi denedi. Gerçek availability API **409** döndürdü ve yayımlanmış sorumlulukların availability ile değiştirilemeyeceğini açıkladı. Sürüm sayısı **6 → 6**, preview fingerprint aynı; mevcut geçerli başvuru daha sonra manager tarafından onaylandı.

Bu, değişen availability ile eski onayın geçersizleştirilmesi değildir: guard değişikliğin kendisini reddetti. Guard kapatılmadı, yayımlanmış hafta test için geri alınmadı, sahte pending application yazılmadı. Önceki writer/final yarış kanıtı ayrı kalır.

## Kanıt ve tekrar çalıştırma

- [API sonuçları](matrix.json): altı gerçek availability submit, yedi Exchange senaryosu ve yedi bağımsız manager assessment HTTP okuması.
- İlk çalıştırma `new_scenarios_this_run=7`. Sonraki çalıştırma `0`: tamamlanan devirler tekrarlanmadı; güncel assessment ve DB durumu tekrar doğrulandı.
- Son READ ONLY denetim: **7 case, 3 completed, 4 cancelled, 3 transfer olayı; 4 shift ilk owner'da, 3 shift yeni çalışanda; 6 availability sürümü**. Aktif test isteği kalmadı. Atamalar ve audit geçmişi kanıt olarak korundu.
- Güncel API kaynaklarından ayrı bundle üretildi: `apps/api/.temp/exchange-availability-20260907`. Gerçek Auth zorunlu, development identity kapalı; yerel Supabase 55321 ve sahipli API 5560 kullanıldı. [Kaynak/runtime hashleri](source-sha256.json).

Yeni ürün kodu veya migration değişikliği yok. Fixture'ın profil ve yayımlanmış shift hazırlığı yerel SQL'dir; availability ve Exchange işlemleri gerçek HTTP üzerinden yürür. Schedule publish UI, Line Up sharing, browser görsel ölçümü, native erişilebilirlik, performans P95, hosted veya insan UAT kanıtı değildir. Sıradaki AT19 boşlukları: swap'ın iki tarafında aynı availability varyantları ve ayrıntılı nedenlerin UI sunumu. AT19 PARTIAL, G05 ve genel goal aktif kalır.

Verifier Python syntax ve hedefli whitespace kontrolleri geçti; kabul tablosundaki 42 satır korundu. Sahipli 5560 listener'ının PID ve tam commandline işareti doğrulanarak API kapatıldı; wrapper exit1 kontrollü durdurmanın sonucudur. Browser servisi açılmadı, diğer süreçlere müdahale edilmedi.

Sonraki tur: takasın iki yönü ve manager gerekçeleri [availability-swap kanıtıyla](../availability-swap/README.md) tamamlandı; merkezi AT19 satırı LOCAL olarak güncellendi. Bu dosyanın önceki kapsam sınırı kendi koşum tarihine aittir.
