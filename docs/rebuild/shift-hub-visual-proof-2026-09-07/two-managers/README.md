# AT08 — İki manager ve açık karar penceresi

İki farklı manager aynı cover talebinde farklı adayları incelerken, ilk kesin karar vardiyanın tek yeni sahibini belirler. Diğer manager'ın açık penceresi güncel sonucu gösterir; eski onay/ret/kapatma eylemini gönderemez. Yazılan taslak not korunur ve gönderilmediği açıklanır. Tek ana eylem **View latest result**; Enter ile kapanınca odak talep başlığına döner.

Tamamlanmış talepte güncel published owner gösterilir; eski talep sahibi güncel sorumlu diye sunulmaz. Swap'ta iki güncel kart vardır. Kaldırılmış publication için tarihsel bilgi açıklaması kullanılır. Başka manager tarafından sonuçlandırılma, iptal, süre sonu ve shift değişimi ayrı metinlerle açıklanır. Açık talepte yalnız seçili adayın çekilmesi halinde önceki güvenli davranış korunur.

## Yerel doğrulama

- **41/41 UI testi:** 40 Hub + 1 dialog. Yedi yeni kontrol: açık approve/reject/close sırasında başka karar; cancelled/expired/invalidated; swap'ın iki güncel sahibi. Not, gönderilmeyen eski komut ve odak dönüşü kontrol edilir.
- Web typecheck, hedefli ESLint ve sabit Vite build PASS. Yeni migration veya API değişikliği yok.
- **Altı gerçek aktör:** iki ayrı manager, owner Alex ve adaylar Blake/Casey/Drew. Normal UI password login; session/token enjeksiyonu yok. Her browser koşumu altı oturumu yeniden açtı.
- İlk akışta ikinci manager'ın not yazdığı onay penceresi açıkken diğer manager finali gönderdi.
- İkinci akışta iki gerçek UI POST'u bariyerle birlikte bırakıldı: tam bir HTTP 200 ve bir HTTP 409. Bariyer yalnız gönderimi geciktirir; response, auth, veri veya saat taklidi yok.

| Ölçüm | İlk işlevsel tur | Nihai tasarım turu |
|---|---:|---:|
| Başka manager kararının açık pencerede görünmesi | 766 ms | 781 ms |
| Eşzamanlı yarışın kaybeden pencerede çözülmesi | 511 ms | 499 ms |
| Gerçek tamamlanmış case | 2 | 2 |
| Beklenen stale POST | 1 × 409 | 1 × 409 |
| Beklenmeyen HTTP/page error veya gezinme | 0 | 0 |

Bunlar command-start → doğru DOM üst sınırlarıdır; iki tekil akış P95 veya hosted performans kanıtı değildir. İlk turda manager2 de yarışı kazandı; nihai turda manager kazandı. Her iki kimliğin de karar verebildiği görülür. [İlk rapor](browser-initial.json), [nihai rapor](browser-final.json).

**Dört case için ayrı READ ONLY DB kontrolü:** bir approved, iki closed_other_selected, tek transfer_completed olayı ve tek başarılı approve komutu. Olayı doğru kazanan manager yazdı. Published owner kazanan başvuruyla aynı. Kaybeden manager'ın özel not olayı yok. Bu dört paylaşılmamış günde sahte Line Up snapshot oluşmadı. [Veri kanıtı](data.json).

Önceki iki haftanın **628 snapshot'ı aynı içerikle korundu**, her sürümde tek doğru owner var. Bu tur onların atamalarını değiştirmedi. [Snapshot kontrolü](snapshots.json).

## Tasarım ve erişilebilirlik

Nihai **9 görünüm**: 320/390/768/1440 px × light/dark ve 390 px / kök font %200. Yatay taşma 0; ölçülen düğmeler en az 44 px; kontrol foreground/background kontrastı en az **7,16:1**. Büyütülmüş owner fontu 30 px. Gerçek Enter ile sonuç açma ve başlık odağı iki akışta geçti. Mobil/light, desktop/dark ve text200 görselleri ayrıca gözle incelendi.

- [Mobil](final-review-updated-320-light.png)
- [Desktop koyu tema](final-review-updated-1440-dark.png)
- [Büyütülmüş metin](final-review-updated-390-text200.png)

İlk ekranlar `review-updated-*` adıyla saklandı. İlk yakalama tema geçişi bitmeden yapıldığı için bazı düğmeler önceki tema rengindeydi; 500 ms sonra gerçek computed renkler doğru çıktı. Nihai harness ekranı almadan önce gerçek hedef background rengini bekler, kontrastı ölçer. Pasif eski onay düğmesi de sonuçlanmış pencereden kaldırıldı; ilk görseller nihai tasarım kanıtı değildir.

Üç başlangıç harness hatası final sonuçlarına dahil edilmedi: fixture'ın kullanıcı nesnesinde employee_id varsayımı; employee için manager view sorgusu (403); Requests URL'sinde eksik `tab=shift-changes`. Bunlar hiçbir final onay göndermedi. Kimlikler gerçek read model'den alınır, actor view ve URL gerçek route'a göre kurulur. Ara raporlar ignored local temp'te korunur.

## Sınırlar ve tekrar

AT08 yerel çekirdek senaryo **LOCAL**. AT16 kapsamı ayrı iki scoped manager onayı değildir; bu iki manager iki lokasyona da yetkilidir. Swap'ın terminal dialog görünümü component kanıtlı; bu browser turu cover üzerinde çalıştı. Native screen reader, gerçek cihaz/safe area, insan UAT, hosted delivery ve pilot kanıtı değildir. G01–G10 genel tamamlanma kapıları açıktır.

Verifier'lar: `supabase/verification/shift_exchange_two_managers_local.py` ve `shift_exchange_two_managers_browser.mjs`. Setup yalnız isim/UUID ile doğrulanan sahipli yerel QA workspace'ini genişletir. Tamamlanmış case tekrar çalıştırılmaz; geçmişi resetleyerek yeni başarı üretilmez. İki ayrı çift toplam dört yeni published shift oluşturdu; tüm kararlar uygulamanın gerçek komut yolundan geçti. Private credential dosyası kanıta kopyalanmaz.

Web build: `supabase/.temp/two-managers/web`, API: mevcut `apps/api/.temp/staffing-immediate-20260907` bundle'ı, 5560/5561. API'nin yeni derlendiği iddia edilmez. Kaynak ve bundle hashleri [manifestte](source-sha256.json). Shared dev/Auth servisleri ve ilgisiz WIP korunur.

Son cleanup: browser koşumları terminal/exit0. 5560/5561 PID ve commandline ile doğrulanıp kapatıldı. API/preview wrapper exit1 kontrollü durdurma sonucudur; preview kapanışındaki vite not found build hatası değildir. Shared5555/5556/Auth korunmuştur. Manifest ve hedefli whitespace/syntax kontrolleri PASS.
