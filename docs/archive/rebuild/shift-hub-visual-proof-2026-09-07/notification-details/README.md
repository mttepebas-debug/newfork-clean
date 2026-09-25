# Bildirimden güncel vardiya bağlamına — yerel kanıt

7 Eylül 2026. G07/G09/G10 ve AT34/35/37/38 kapsamındaki bir dilimdir; genel goal açık.

## Ürün davranışı

Bildirim listesindeki güvenli özet korunur. **View shift details** tek bir satırı açar; yetkili ve güncel case okumasından sonra gönderildiği andaki mesaj, güncel talep durumu ve yayınlanmış vardiya sorumluları ayrı gösterilir. Swap iki kart, cover/open pickup tek kart kullanır. Tarih/yıl, saat, lokasyon/job, saat dilimi ve Schedule bağlantısı görünür. Açmak okundu işaretlemez; bağlantıyı izlemek mevcut okundu davranışını kullanır.

Owner/iki owner sorumluluğu son manager onayına kadar açık yazılır. Gerçek açık vardiyada sorumlu kişi uydurulmaz: Awaiting volunteers ve Current assignment / Open shift. Artık yayınlanmayan source/counterpart için geçmiş bilgi etiketi kullanılır; eski snapshot güncel kişi kanıtı sayılmaz. Eski API counterpart bayrağını sağlamazsa da güncel sorumlu iddiası yoktur. Hata/erişim reddinde içerik gizlenir, retry ve request bağlantısı kalır. Özel notlar, diğer adaylar ve gerekçeler bu panelde gösterilmez.

22000 migration read-service sonucuna counterpart için `requested_current_published` ekler. Mevcut grants ve atama davranışı korunur. Yalnız main local DB'ye CLI ile oluşturulup uygulanmıştır; hosted ve izole replay kurulumu yoktur. Shared schema alanı opsiyoneldir. Kart Shift Hub'dan ortak bileşene çıkarıldı; Notifications tüm Hub'ı import etmez.

## Son gerçek tarayıcı koşumu

[result.json](result.json), kaynak rapor `supabase/.temp/shift-exchange-multisurface-browser-1788821952244.json`. Sabit API5560/web5561 web-v3, normal manager/Alex/Blake UI girişleri; auth injection, HTTP mock veya sahte saat yok. Üç inbox açıktır; ayrıntı görsel turu manager ve Alex için yapılır.

- 320/390/768/1440 × light/dark × iki rol =16 görünüm; iki ek390px/200% kök font = **18/18 PASS**.
- Yatay taşma0, ölçülen link yüksekliği44px (200% metinde48px), görünür klavye odağı; kök font16→32, yeni panel gövdesi14→28px.
- Klavyeyle aç/kapat; her iki güncel sorumlu gerçek API ile aynı. İki rolde disclosure notification mutation0.
- Çalışanın First shift bağlantısı gerçek8 Aralık Schedule'ına gider; doğru kişisel vardiya görünür. Bu koşumda bildirim önceden okunmuş olduğundan readActions0; ilk koşumda1. Unit test okunmamış linkin read aksiyonunu ayrıca doğrular.
- Yeni yalnız sahipli QA swap create→peer accept; manager finali yok. Sonunda owner iptal eder. İki owner Alex/Blake ve iki snapshot sürümü155/155 önce/sonra aynı. Audit/case geçmişi silinmez.
- HTTP/pageerror/command failure0; browser exit0. Owned5560/5561 listener'ları kanıt alındıktan sonra kapatılır; main dev/Auth ve ilgisiz WIP korunur.

Son pending case `e2c023a2-782c-4a09-976f-c7f52b990a18`; eski onay örneği `ba685e12-c90b-4587-a212-a274fba729c5`. Önceki v1/v2 raporları ve görselleri korunur. V1 mobil yan boşluk/masaüstü ortalama problemi görsel incelemeyle bulundu ve düzeltildi; nihai görseller yalnız result.json'da listelenen web-v3 dosyalarıdır. Son manager320 light ve employee1440 light ekranları ayrıca gözle incelendi.

## Odaklı doğrulama

- Yeni bileşen **10/10**: yetkili okuma, güncel kişi refetch, eksik yayın/erişim, manager linkleri, okunma, açık vardiya/cover metni, tek panel, güvenli URL. Önceki8 testli aşamada Hub22+Dialog1+CommunicationPages3 ile34/34 toplam geçti; final10 koşumu ayrı raporlanır.
- Web typecheck, hedefli ESLint, iki browser script syntax ve diff whitespace PASS.
- Yeni SQL12/12 + function privileges3/3 main local PASS: source/counterpart publication, unrelated actor read reddi, okuma owner koruması ve historical fallback. [sql.json](sql.json).
- SQL fixture ortak archived seed employee/location kayıtlarını değiştirmez; rollback içinde kendi employee/location/job/type referanslarını oluşturur.
- [source-sha256.json](source-sha256.json) bu kanıt anındaki kaynakları sabitler; genel dirty checkout/release hash'i değildir.

## Açık kapılar

Gerçek kullanıcıların eski mesaj/güncel sorumluluk ayrımını anlaması ölçülmedi. Bu koşum tüm cover/ret/iptal/departure/role değişimi varyantlarının browser kanıtı değildir; removed counterpart ve live query invalidation bu tur unit/SQL düzeyindedir. Native zoom/reader/cihaz, human UAT ve hosted/pilot açık. G07 için My Team/exchange detayları, staffing command anlık teslimi ve diğer rol/uygunluk/recovery senaryoları ayrıca sürer.18 görsel kontrol G10 insan tasarım puanı yerine geçmez.
