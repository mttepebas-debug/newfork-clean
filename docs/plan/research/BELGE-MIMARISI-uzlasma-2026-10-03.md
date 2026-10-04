# Belge mimarisi — uzlaşma kaydı (Mert + koordinatör, 2026-10-03)

> **RAFTA — 2026-10-03 ~19:30Z, Mert'in kararı** (koordinatör `local_10a5177a…`'ın penceresinde):
> "bu belgelerle ilgili planı olduğu gibi rafa kaldırıp daha sonra kaldığımız yerden devam etmek
> istiyorum. çünkü bu konuda bazı radikal kararlar alıp yön değişikliği yapabilme ihtimalim var."
> Seçenek: "Sohbet rafa, testler koşsun (Önerilen)".
>
> - **Rafta olan:** bu dosyadaki sohbetin tamamı (U1–U12, T1–T9, "Açık" listesi) ve ondan doğacak
>   her kod işi (Schedule'ı besleyen 16 okuyucunun taşınması, U2/U3/U9 kuralları, U6 görünürlük,
>   BL-557, BL-559). Kararlar silinmedi ama **yürürlükte sayılmaz**: KARARLAR'a ve ILKELER'e
>   işlenmez, hiçbir oturum bunlara dayanarak karar vermez ya da kod yazmaz. Mert yön
>   değiştirebilir; dönüşte her U satırı Mert'e yeniden teyit ettirilir.
> - **Rafta olmayan:** canlıdaki FB-6.6 (A1+A2+B, main `84ada590` / `f4dce985`) olduğu gibi kalır.
>   A3'ün 8 e2e senaryosu (`task/fb-6.6-a3` @`2ba927b3`) koşturulup main'e alınır, FB-6.6
>   "bugünkü hâliyle" kapanır. Yön değişirse testler yeni kurala göre yeniden yazılır.
> - **Raftan iniyor (kullanıcı kararı 2026-10-04, Mert, işçi oturumu 2 `local_1628762e…`'ın penceresinde; işçi raporu `.newfork-inbox/done/20261004T211002-isci-2-nf-arayuz-belge-karma.md`; koordinatör beslemesi #170):** onboarding belgeleri için karma akış seçildi (KARARLAR Ürün kuralları → "Onboarding belgeleri — karma akış"; taslak https://claude.ai/artifact/PSSd8Nxgbe8BjY78oCkJim v1, Mert onayladı). Önce iki ön koşul: BL-560 (yerleşik Manager rolünde belge izni yok) ve bu dosyanın uzlaştırılması (karma kararları bazı U satırlarının yerine geçebilir; dönüşte her U satırı Mert'e yeniden teyit ettirilir). Sıra Mert'le henüz belirlenmedi; tek hat: AVAIL-002 kapanınca sıraya girer.
>   **"Açık" listesinin onboarding maddesi cevaplandı (madde 8):** zorunlu belge "settingsteki ayarlara ve belge türlerine göre" bekler (Mert'in kendi sözü; önerilen "yüklemeyi bekler" reddedildi): "Manager review required" olan Required belgede kişi onayı bekler, olmayanda yüklemeyi bekler; workspace ayarı "manager approval" ise müdür ayrıca onboarding'in tamamını onaylar. Sıradaki dönüş noktası: "sonradan yayınlanan zorunlu belge" ve listenin kalanı.
> - **Dönüş noktası (kaldığımız yer):** "Açık" listesinin ilk maddesi: onboarding'in ince noktaları
>   (zorunlu belge onay mı yükleme mi bekler), sonra bildirim içerikleri, sonra uygulama sırası /
>   parçalama. `nf-db`'nin okuyucu ölçümü (16 doğrudan, 28 servislik geçişli zincir, a/b/c yolları)
>   `BELGE-MIMARISI-okuyucu-olcumu-2026-10-04.md`'de; dönüşte yeniden ölçülür — tazelik kuralı. Dönüşte önce bu dosya ve
>   `docs/plan/tasks/FB-6.6.md` bugünkü main'de yeniden ölçülür (CLAUDE.md §5 adım 0).

Bu bir uygulama planı değil: belge mimarisinin sohbette parça parça uzlaşıldığı kayıt. Kod yok; Mert ayrıca izin verecek.
Adlandırma (Mert'in kuralı): Lokasyon+Pozisyon+N (KadıköyMüdür1, KadıköyGarson1, KadıköyBeşiktaşGarson2, Admin1, Owner1).

## Bugünkü durum (keşif, main 84ada590 / 55799d60)
- Türler: required / conditional / optional (`document_types.lifecycle_settings.mode`). Conditional = süre tanınan zorunlu (period_days; aktivasyonda grace başlar, bitince overdue/missing).
- Ayarlar iki yerde: Settings → Scheduling → Conflict handling (`conflict_rules`: document_required, document_conditional_grace, document_conditional_overdue; warn/confirm/block) + Settings → Documents belge başına (mode, period_days, `suspend_on_overdue` = "kişiyi kısıtla").
- Kısıtlı kişi: `document_actor_blocked` → yalnız restricted_ok eylemler (kendi belge/onboarding/bildirim/iletişim).
- Schedule: `app_private.document_shift_reasons` → `assess_weekly_shift_availability` (16 public çağıran: read model, assess, auto-fill, publish preview/publish, shift hub). Auto-fill yalnız `allowed`; aday listeleri (cover/swap/pickup) herhangi bir nedende `ineligible`.
- Kırık: onaylı belgenin süresi dolunca yeni son tarih atanmıyor (kişi ya anında ya hiç kısıtlanmıyor).

## Uzlaşılanlar
| # | Konu | Karar | Kaynak |
|---|---|---|---|
| U1 | Tür anlamları | Bugünkü tanımlar doğru: required = onboarding'de şart, onaylanmadan aktif olmaz; conditional = süre tanınan zorunlu (grace → overdue); optional = etkisiz | Mert (önerilen) |
| U2 | Ayar yeri | Bugünkü gibi iki yerde: Schedule davranışı workspace geneli (Conflict handling), kısıt belge başına. Üç belge kuralının varsayılanı "onay iste" (confirm) — grace bugün warn, confirm'e çekilir | Mert (önerilenin tersi: "belge başına tek yer" reddedildi) → ILKELER kanıtı |
| U3 | Süre dolma | Onaylı required/conditional belgenin süresi dolunca eksik sayılır (expired); conditional'da yeni grace yok → overdue kuralı; kısıt kutusu işaretliyse dolduğu gün kısıt; yenisi gönderilmiş ve onay bekliyorsa kısıt yok | Mert (önerilen, "conditional/required" düzeltmesiyle) |
| U4 | Auto-fill / takas | Auto-fill belgesi eksik kişiyi seçmez. Takas / devir / açık vardiya listelerinde kişi görünür; almak isterse talep yöneticinin onayına gider, yönetici uyarıyı görüp karar verir | Mert (önerilenin tersi: "sistem seçmez, listede çıkmaz" reddedildi) → ILKELER P24 kanıtı |
| U3+ | Zorunlu dolunca | Mert tekrar sordu, "U3 kalsın: süre yok" (önerilen). Kısıtlı kişi = Account → Documents'a düşer; vardiyaya yazılabilirliği Schedule kuralı belirler (açık nokta) | Mert (önerilen) |
| U6 | Belge görünürlüğü | Kişinin belgelerini (onaylılar dahil), belge durumunu ve uyarılarını yalnız o kişinin belgesine karar verebilenler (rütbe zinciri: no_self + rank_below) ve kişinin kendisi görür. KadıköyMüdür1 KadıköyMüdür2'nin hiçbir belgesini görmez; Admin2'ninkini yalnız Owner1. İstisna: vardiyayı yazan müdür uyarıda "belge eksik" notunu görür (kapsamı U7). Sekiz yüzey tek kurala bağlanır | Mert (önerilen) |
| U7 | İstisna sınırı | Not kartta kalıcı değil; vardiyayı yazan / taşıyan / düzenleyen / yayınlayan her müdür işlem anındaki uyarıda yalnız "<belge>: belge eksik" görür ve onaylar; ayrıntı (reddedildi / bekliyor) yalnız karar verenlerde | Mert (önerilen) |
| U8 | Kısıtlı kişi ve Schedule | Kısıt yalnız uygulama erişimini kapatır; vardiyaya yazılabilirliği Conflict handling belge kuralı belirler (varsayılan onay iste) | Mert (önerilen) |
| U9 | Sonradan yayınlanan zorunlu | Zorunlu belge tanımına "aktif çalışana teslim süresi" (gün); aktif kişiye süre o gün başlar, içinde "ek süre" kuralı, bitince eksik + kısıt kutusuna göre kısıt. Onboarding kuralı (onaylanmadan aktif olmaz) değişmez | Mert (önerilen) |
| U10 | Acknowledgements | Aynı görünürlük kuralı (rütbe zinciri, U6): kimin neyi imzalayıp imzalamadığını yalnız karar verenler + kişinin kendisi görür | Mert (önerilen) |
| U11 | Saat dilimi modeli | Vardiya, takvim ve izin günü saatleri lokasyonun saat diliminden; birincil lokasyonu olmayan kişi için yedek workspace saati (varsayılan ilk lokasyonun, değiştirmek isteğe bağlı); belge bitişi yalnız tarih ("o günün sonuna kadar geçerli"); kişi başına saat dilimi yok. Rakip araştırması: lokasyon saati sektör kalıbı, hesap saati yalnız yedek/sınır, belge bitişi tarih-only | Mert (önerilen) |
| U12 | Çok lokasyonlu tam gün izin | Birincil lokasyonun gece yarısında başlar (7shifts emsali, bugünkü kural) | Mert |
| U5 | Aday notu | Çalışan (KadıköyGarson2) adayın nedenini görmez, yalnız "Manager approval needed"; aday kendi eksiğini görür; onaylayan yönetici "Food Handler: missing" görür | Mert (önerilen) |

## U6'dan türetilenler (Mert'e gösterildi, itiraz yoksa geçerli)
- T1 Bildirim / yapılacak: "süresi doluyor", "eksik", "inceleme bekliyor" yapılacak ve bildirimleri yalnız karar verenlere + kişinin kendisine (bugün to-do `employee.read` ile herkese).
- T2 Muafiyet / süre uzatma / inceleme düğmeleri satır başına karar verene (B Y3: sunucudan satır başına `can_review`).
- T3 Rol değişimi: KadıköyGarson1 müdür olunca KadıköyMüdür1 onun belgelerini görmez; bekleyen incelemesi KadıköyMüdür1'in kuyruğundan çıkar, Admin1/Owner1'e geçer (P08 bugünkü rol).
- T4 Ghost vardiya: KadıköyBeşiktaşGarson2'nin karar vereni iki lokasyonun müdürleri; ghost kartta belge bilgisi yok (bugünkü gibi), işlem anındaki uyarı U7'ye göre.
- T5 Çekmece önizlemesi `clears_block` (kişi kısıtlı mı) karar veremeyene gizlenir.
- T6 Grid kartı belge sorununu "unavailable" diye yanlış etiketliyor → U7 ile "belge eksik" notu.

- T7 Birincilsiz kişinin izni workspace saatiyle (bugün ilk atanan lokasyon). (Mert kabul)
- T8 Lokasyonsuz kişinin izni workspace saatiyle — Mert'in 2026-09-30 "cihazın saati" kararının yerine geçer. (Mert kabul)
- T9 Sahiplik devrinde eski owner'a otomatik birincil (ilk atandığı lokasyon); yerelde birincilsiz 16 admin = 16 eski owner. (Mert kabul)

## Açık (sırayla konuşulacak)
- Rol hiyerarşisi ve görünürlük: çalışanın / müdürün / admin'in belge uyarısını kim görür (Mert'in taslağı KARARLAR:87); ızgarada kalıcı mı, eylem anında mı; uyarı metninin ayrıntısı.
- Yayın, ghost vardiya (çok lokasyon), Employees listesi rozetleri, bildirimler, muafiyet / süre uzatma (satır başına can_review — B Y3), rol değişimi, lokasyon değişiminde önizleme.
- Onboarding: zorunlu belge onay mı yükleme mi bekler; sonradan yayınlanan zorunlu belge.
- BL-559: birincil lokasyonu olmayan kişinin belge saat dilimi (P18 temel model).
- Acknowledgements ayrı mı.

## Plan modu dışına çıkınca yapılacaklar (bekleyen)
- ~~FB-6.6 B'yi main'e al~~ — yapıldı (main `f4dce985`, CI 37115516542 yeşil).
- Kayıt oturumuna besleme: U1–U5 + iki ters seçim (ILKELER kanıtı), posta kutusu ack'leri.
