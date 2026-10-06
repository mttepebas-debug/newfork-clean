# EKRAN-01 Schedule: kapanış ölçümü

**Ölçüm noktası:** `origin/main` = `b375ad38`, fetch 2026-10-06 13:59Z. Bilgisayar yeniden başladıktan sonra tazelendi. Kesintiden önceki okumalar `9e390950` üzerindeydi. Arada yalnız üç commit geldi: UNDO-db-bulgu'nun kodu `b921a0fd` ve belgesi `b6fdbc46`, ve REMOTE-CI belgesi `b375ad38`. Bu yüzden önceki okumalar hâlâ geçerli. Yalnız okuma, git ve gh yapıldı. Test koşturulmadı, DB'ye SELECT gerekmedi.

**Özet:** Görev dosyasındaki 19 dilimden 12'si main'de, 7'si hiç başlamadı (DB-4, W-2, W-3, W-4, W-5, T-1, K-1, Z). İş kaybını önleyen ve yetkiyle ilgili çekirdek bitti. Görünüm, erişilebilirlik ve telefon hattına hiç girilmedi. Ekran "bitti" sayılamaz.

---

## 1. Dilim tablosu

| Dilim | Durum | Main'deki commit | Arşiv dosyası |
|---|---|---|---|
| DB-1a (düzenleme oturumunun yetkisi) | main'de | `a4e0ba11`, `cf888c14` (+`5110dfe3` W-1b'de) | DB-1a.md |
| DB-1b (Auto-save, oturum ömrü) | main'de | `20339ae2`, `40f2948a`, `a089f778` | DB-1b.md |
| DB-1c (Undo sunucuda) | main'de | `bb7df088`, `71b3eb37`, `ec38901d` | DB-1c.md |
| DB-2 (canlı kanal lokasyona göre) | main'de, DB ve API iki yarısı da | DB `8fec3a7d`; API ve web `39e94551`, `ae526db3` | DB-2.md, DB-2-API.md |
| DB-3 (şablonda Replace, mola, Live etiketi) | main'de | `511aed11`, `3304a858`, `9b93169d` | DB-3.md |
| **DB-4** (yayın ve saat kuralları) | **başlamadı** | — (grep 0 sonuç) | yok |
| BE-1 (API yetki temizliği) | main'de | `7cb8813c`, `77bbc7e3`, `62c3b07f`, `b3bcb20a` | BE-1.md |
| BE-2 (Export ve sözleşme) | main'de | `efe215a4`, `e986f346`, `33da6e00`, `2de22655` | BE-2.md |
| W-1a (düzenleme, sunucusuz kısım) | main'de | `4ee08493`, `6682304e`, `6501b429`, `8440c6bb` | W-1a.md |
| W-1b (düzenleme, sunuculu kısım) | main'de, S2 (Undo) dahil | `ed74a30b` … `21c778bd`; S2: `05c19950`, `86d9a4e6`, `9a6fe619` | W-1b.md, UNDO.md |
| **W-3** (kararı verilmiş ama kodda olmayan arayüz) | **başlamadı** | — | yok |
| **W-2** (erişilebilirlik ve klavye) | **başlamadı** | — | yok |
| **W-4** (37 prototip kalemi, görünüm) | **başlamadı** | — | yok |
| **W-5** (telefon ve dar ekran) | **başlamadı**; telefon kısmı TEL-KAPALI kararıyla büyük ölçüde boşa düştü | — | yok |
| VAR (görsel varyantlar) | bitti (R0, varyant dalı main'e girmez); Mert'in seçimleri KARARLAR'da | belge `dea554e5` | VAR.md |
| DRAG (sürükleme rengi) | main'de, üç parça: ölçüm, API, arayüz | `7f7e90dc`, `6b35a5cc`, `4d2e571a` | DRAG-olcum.md, DRAG-API.md, DRAG-UI.md |
| **T-1** (eksik e2e senaryoları) | **başlamadı** | — | yok |
| **K-1** (büyük dosyaları bölme) | **başlamadı** | — (grep'teki 7 eşleşme sahte, "KK-1xx" satırları) | yok |
| **Z** (kapanış) | **başlamadı** | — | yok |
| **Sonradan eklenenler** | | | |
| BE-2b-DB, BE-2b-API (kısmi teslim e-posta kuralını kapatmaz) | main'de | `7bd0190f`; `d2264f7a`, `27f102db` | iki dosya |
| BE-2b-O1 (geçici hatada bir kez yeniden deneme) | **main'de değil**; yerel dal `task/ekran-01-be-2b-o1`, 2 commit main'de yok (`git cherry`), uzakta dal yok | — | yok |
| TEL-KAPALI, TEL-KAPALI-2 (Schedule telefonda kapalı) | main'de | `81aa5544`; `bdd1be43` | iki dosya |
| CI-HIZ, CI-HIZ-2 | main'de | `23f168ae`; `5884b5c0` | iki dosya |
| VAR-UYG-DB, VAR-UYG-DB-2, VAR-UYG (müsaitlik "!" ve izin hücresi) | main'de | `1154d318`, `0744e5a9`, `8eeae457`, `587b9520` … `1ed53a2c` | üç dosya |
| VAR-UYG-KIRMIZI | main'de | `88f5e7a1` | **arşiv dosyası yok** |
| UNDO-db-bulgu (onaylı atama geri yüklemesi Undo adımı sayılmaz) | main'de (bu ölçümde girdi) | `b921a0fd` | UNDO-db-bulgu.md |

**Dallar ve çalışma klasörleri:**
- `git branch -r --list "origin/task/ekran-01*"` boş, uzakta açık dal yok.
- Yerelde iki dal var. `task/ekran-01-undo-db-bulgu` main'e girmiş (`git cherry` boş), silinebilir. Çalışma klasörü `.claude/worktrees/gallant-feistel-508e83`.
- `task/ekran-01-be-2b-o1` main'e girmemiş, çalışma klasörü `.claude/worktrees/optimistic-dewdney-c78421`. Bu klasör BE-1, BE-2 ve W-1a'nın da eski çalışma klasörüydü.

## 2. "Done when (ekranın tamamı)"

| # | Madde | Hüküm | Kanıt |
|---|---|---|---|
| 1 | Her bulgu ve BL "kapandı (commit)" ya da adıyla ertelendi, liste dosyanın sonunda | **karşılanmadı** | `EKRAN-01-SCHEDULE.md` "Notes / Result" bölümünde yalnız yer tutucu satır var. Kapsamdaki 114 BL'nin 113'ü BACKLOG'da açık (5. bölüm). |
| 2 | 37 prototip kalemi gerçek uygulamada, kanıtıyla | **karşılanmadı** | W-4 başlamadı. 37 kalemlik tablo yok. |
| 3 | VAR'daki altı madde Mert'in seçimiyle uygulandı | **kısmen** | Uygulanan (VAR-UYG): BL-524 ad hücresindeki "!", BL-525 izin hücresi ("TIME OFF" kırmızı hücre). BL-441'de karar var (KARARLAR:519), uygulama W-3/W-4'te ve görülmedi. C-P2 boşa düştü (KARARLAR:517 "Schedule telefonda tamamen kapalı"). Üretimi bekleyen: BL-445, C-D11 (W-4/W-5). |
| 4 | Tam kapı, `test:db`, e2e ve main CI yeşil | **ölçülemedi / karşılanmadı** | Ekranın tamamı için tam kapı koşulmadı (Z yok). Main CI: 37467116856 (`29e504d5`) **cancelled** (39m56s, yeniden başlatma sırası). 37474576648 (`b6fdbc46`) 13:59Z'de **in_progress**. Son yeşil kod koşusu 37463485372 (`48de63c5`). |
| 5 | 1440 ve 390 ekran görüntüleri `artifacts/nf-gorsel-qa/EKRAN-01/` altında | **karşılanmadı** | Böyle bir klasör yok. Var olan `EKRAN-SCHEDULE/` (102 dosya) 2026-10-05 tarihli, keşiften kalma. |
| 6 | Açık sorular cevaplandı ve KARARLAR'a yazıldı | **karşılandı** | 4. bölüm |

## 3. Main'deki dilimlerde karşılanmamış kalan maddeler

| Dilim | Kalan | Kaynak |
|---|---|---|
| BE-1 | (3) Owner, Ayşe'nin Moda kuralını düzenleyemiyor; arşivli kuralı müdür düzenleyebilir mi sınanmadı. BL-494'ün kapısı veritabanında (`created_by = actor`), **yapılmadı**, veri hattına devredildi, sonra iş açılmadı. Ölü DB fonksiyonu `get_schedule_publication_history_service` silinmedi. | BE-1.md §3 |
| BE-2 | (6) `schedule-data.ts`'te bilerek bırakılmış 9 fonksiyon (BL-437 için) ve `isEditSessionStale` var. Eski Export API uçları (`/schedule/export/preview*`, `/schedule/export`) ölü, silinmedi. | BE-2.md §3 |
| BE-2b | O1: geçici gönderim hatasında yeniden deneme yok. Düzeltmesi yalnız yerel dalda. | BE-2b-API.md |
| W-1a | (1)'in e2e yarısı (sayfa yenilenince düzenleme geri gelir) T-1'e bırakıldı, T-1 yok. | W-1a.md |
| W-1b | (1) Hareketsizlik senaryosunun e2e'si T-1'e bağlı. KK-162'nin ikinci yarısı yok: işi kenara konan Ayşe bir dahaki açılışta bilgi satırı görmüyor. Şeritte kalıcı D-O9 satırı yok (bugün kısa bildirim), W-3/W-4'e bırakıldı. | W-1b.md §3 |
| DB-1a | B-9'un "ad çakışmasından başka lokasyon yoklanabiliyor" kalemine dokunulmadı. Yetki reddini nedensiz veren üç fonksiyon backlog önerisi olarak kaldı. | DB-1a.md §3 |
| DB-1b | Kirası dolmuş, sahipsiz düzenleme kendiliğinden Auto-save'e çevrilmiyor (zamanlanmış süpürücü yok; bilerek dışarıda). | DB-1b.md §3 |
| DB-1c | 4 Düşük not backlog'a önerildi: yayın arşivli kişiyi ya da iş atamasını yeniden kontrol etmiyor, adım sırası, 25 adım sınırı, kapalı gün testi. | DB-1c.md:54-58 |
| DB-2 | Aynı lokasyondaki iki müdürün birbirini "düzenliyor" göstermesi (presence içeriği). Ölü `pending-ops` POST/PATCH/DELETE uçları. | DB-2.md, DB-2-API.md |
| DB-3 | Replace'in iki tıkı ve önizlemesi ekranda yok: ekran hâlâ tek tıkla Overwrite çağırıyor (W-3). `mutate_schedule_edit_shift_service`, yükte alan yoksa molayı 0'a ve `hide_time_on_badge`'i false'a çeviriyor. | DB-3.md §3 |
| VAR-UYG-DB | Taşınıp yalnız yeni lokasyonu yayınlanan vardiyada yayından Edit'e girmek `23505` ile düşüyor. **(leave: high / do: risky)** | VAR-UYG-DB.md §3 |
| DRAG-UI | `styles.css:5836` ve `:5856`'da ham renk kaldı (W-4'e aday). | DRAG-UI.md |
| TEL-KAPALI | `styles.css` 520/720 px kurallarında ölü Schedule CSS'i (W-4/W-5). | TEL-KAPALI.md |
| UNDO | shared `timezones.test.ts` yük altında 5 sn'yi aşıyor (backlog önerisi). | UNDO.md §3 |

## 4. Açık sorular

| # | Cevap | Nerede | Uygulandı mı |
|---|---|---|---|
| 1. Kilidi düşen kişinin işi kimin önüne çıkar | (a) Auto-save taslağı + bilgi satırı (KK-162) | KARARLAR:511 | **Kısmen.** Taslak adı ve açan kişiye giden bildirim var (DB-1b, W-1b `12b8e9b1`). Kalıcı şerit satırı ve "Ayşe sonradan görür" yarısı yok. |
| 2. Sürüklemede amber | (a) Mert: üç renk | KARARLAR:509 | **Evet:** DRAG-API ve DRAG-UI (`7f7e90dc`, `4d2e571a`) |
| 3. Replace: pencere mi, iki tık mı | (a) iki tık, ilk tıkta etki yazısı (KK-162) | KARARLAR:512 | **Hayır:** sunucunun önizleme ucu hazır (DB-3), düğme W-3'te ve W-3 yok |
| 4. BL-362 (izni kısalt ve ata) | (a) Requests turuna (KK-162) | KARARLAR:513 | Uygulanacak bir şey yok (karar: bu turda yok) |
| 5. Undo kaydedilmiş adımı geri alır mı | (a) Mert: almaz | KARARLAR:510 | **Evet:** DB-1c ve UNDO (Save draft geçmişi siler) |
| 6. Zamanlanmış e-posta hangi haftayı yollar | Mert: kapsam dışı, BL-437'ye not | KARARLAR:515, BACKLOG:692 | Not yazıldı. Görev dosyası, W-3 başlamadan koordinatörün konuyu yeniden açmasını istiyor. |

## 5. BL maddeleri

- **Sayım:** Görev dosyasının In scope bölümünde ve eşleme tablosunda geçen 114 farklı BL numarası var.
- **BACKLOG'daki durum:** 1'i kapalı, BL-552. Bu da keşifte BL-685'e birleştirildiği için kapalı (2026-10-05), uygulamayla kapanmadı. **113'ü açık.** Uygulamayla kapanan kapsam-içi madde 0.
- **Fazla düzgün sonucu elle doğruladım:**
  - BL-688, BL-700 ve BL-616'nın blokları açık; altlarında "Kapandı" satırı yok (BACKLOG:1364, :1380, :1188).
  - Kapanış biçimi bozuk değil: BACKLOG'daki tek "Kapandı 2026-10-06" satırları BL-756 (:67) ve BL-562 (:1054). BL-562 de kapsam dışında.
- **Yorum:** Sayı bozuk bir ölçüm değil. Biten dilimlerin backlog kapanışları hiç yazılmamış.

**İşi main'de bittiği hâlde açık duran, kapanması gerekenler** (dilim raporuna göre, her biri tazelikle doğrulanmalı):
- **Yüksek önemde olanlar:**
  - BL-688 (S1): hareketsiz kalınca iş silinmiyor, Auto-save taslağına geçiyor.
  - BL-689 (S2): Undo sunucuda da geri alıyor.
  - BL-690 (D-Y3): kilit düşünce ekran toparlıyor.
  - BL-691 (D-Y4): yenilemede taslak boş görünmüyor.
  - BL-692 (D-Y5): bir müdürün kaydedilmemiş işi ötekinin ekranında görünmüyor.
- **Orta önemde olanlar:**
  - BL-693: canlı kanal yetki çekirdeğinde.
  - BL-694: veri tarafı kapandı, iki tık W-3'te; kısmen kapatılabilir.
  - BL-695: düzenlenen taslak silinemiyor.
  - BL-696: şablonda mola korunuyor.
  - BL-697: yeni vardiyaya "Live" yazmıyor.
  - BL-698: kurtarma taslağının adı.
  - BL-700: Export yetkisi çekirdekte.
  - BL-704: sürükleme rengi.
- **Düşük önemde olanlar:**
  - BL-159 ve BL-412 (DB-1a).
  - BL-224 (DB-1b).
  - BL-292 ve BL-545 (DB-3).
  - BL-280'in (4) kalemi, BL-282, BL-391, BL-168, BL-685 ve BL-703 (BE-1/BE-2).
  - BL-702'nin kapsadığı kısım.
  - BL-616 (W-1a), BL-709 (D-D3), BL-524 ve BL-525 (VAR-UYG), BL-101 (BE-2 ölçüm sonucu).
- **Bilerek açık kalacaklar:** BL-494 ve BL-437 yapılmadı.

## 6. EKRAN-PLANI ekran 1 satırı

- **Bugün** (EKRAN-PLANI:87): "karar — görev dosyası yazıldı (…, 2026-10-06), 6 açık soru". Bayat: altı soru cevaplandı ve uygulama sürüyor.
- **Önerim:** "uygulama — 12/19 dilim main'de (+11 ek dilim); kalan DB-4, W-2, W-3, W-4, W-5, T-1, K-1, Z; açık sorular cevaplandı (KARARLAR Schedule 2026-10-06)".

## 7. Kalan iş, önem sırasıyla

1. **Kayıt düzeltmesi** (planlama). Bitmiş dilimlerin BL kapanışları BACKLOG'a, kanıtları görev dosyasının "Notes / Result"una yazılsın. Bugün kayıt, işin bittiğini göstermiyor.
2. **W-3** (arayüz). Replace iki tık (sunucu hazır, ekran hâlâ tek tıkla Overwrite çağırıyor), Unassigned satırı görünüm modunda gizli, "Save as template", BL-038'in altı kararı, Export paneline e-posta kuralı (BL-437), altı pencere stil B'ye, D-O9 şerit satırı.
3. **VAR-UYG-DB'nin `23505` hatası** (veri). Taşınıp yalnız yeni lokasyonu yayınlanan vardiyada yayından Edit'e girmek düşüyor (leave: high / do: risky). Backlog'da numarası olup olmadığı ölçülmedi.
4. **DB-4** (veri, R3). Pazar akşamı "bu hafta"nın UTC'yle hesaplanması (BL-238, high / risky) ve BL-174, BL-326, BL-510, BL-619, B-7, BL-371; dört maddenin ölçümü.
5. **BL-494** (veri). Owner ve admin Export kuralını kim kurduysa kursun düzenleyebilmeli (BE-1'den devredildi, sonra iş açılmadı).
6. **T-1** (test). Sürükle-bırak, Undo, Auto-save, yenileme ve Replace için e2e. W-1a ve W-1b'nin e2e yarıları buna bağlı.
7. **W-2** (arayüz). Pencereye odak, ızgarada tek Tab durağı, kontrast, Esc katmanları, S4 ve S5.
8. **W-4** (arayüz). 37 prototip kalemi, ham hata metinleri (BL-395), küçükler, ölü CSS, BL-445 ve C-D11'in üretimi.
9. **BE-2b-O1** (veri ve API). Yerel daldaki yeniden deneme düzeltmesi gönderilsin ya da bırakılsın. Bugün dal açık ve main'de değil.
10. **W-5** (arayüz). Telefon kapandığı için 768 ve 1024 px kısmı kaldı. BL-334 ve BL-580'in Schedule'da hâlâ geçerli olup olmadığı ölçülsün.
11. **K-1** (veri ve web). `SchedulePage.tsx` ve `schedule-routes.ts` 1500 satırın altına (BE-1 sonrası `schedule-routes.ts` 1433 satır, o yarısı muhtemelen tamam), BL-275.
12. **Z** (koordinatör ve görsel QA). Tam kapı, `test:db`, e2e, 1440 ve 390 görüntüleri `artifacts/nf-gorsel-qa/EKRAN-01/` altına.
13. **Düzen** (git). Main'e girmiş `task/ekran-01-undo-db-bulgu` dalı ve klasörü silinebilir. VAR-UYG-KIRMIZI'nin arşiv dosyası eksik.
