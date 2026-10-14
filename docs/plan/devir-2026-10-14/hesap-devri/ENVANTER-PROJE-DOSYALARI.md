# Proje dosyaları envanteri (`/mnt/project-files`) — hesap devri için

Tarih: 2026-10-14. Hazırlayan: devir hazırlığı için salt okur alt ajan. Bu dosya dışında hiçbir şey değiştirilmedi.
Kapsam: `/mnt/project-files` (devir/ klasörü hariç; o klasör şu an yazılıyor).
Yöntem: klasör listesi, boyut (`du -sh`), dosya sayısı (`find | wc -l`), README ve markdown dosyalarının ilk satırları, küçük HTML dosyalarının yalnız `<title>` satırı. Büyük HTML ve PNG dosyalarının içi okunmadı. "çıkarım" yazan yer dosya adından ya da tarihten tahmindir.

## Kısaca

- Toplam: **421 MB, 2149 dosya** (devir/ hariç).
- Neredeyse hepsi (`pages/` 380 MB) claude.ai Artifact sayfalarının **yayınlanmış HTML dosyaları ve onları kuran kaynaklar**.
- Yeni hesapta bu klasör olmayacak. Ama:
  - Artifact'lar claude.ai'da yayında durur; dosyalar yalnız **yeniden yayın ve yeniden derleme** için gerekir.
  - Uygulama kodu GitHub'da (`mttepebas-debug/newfork-clean`); buradaki "app.html" dosyalarının çoğu o koddan yeniden kurulabilir.
- **Mutlaka saklanacak çekirdek** (≈25 MB): kök markdown dosyaları, `notes/` içindeki markdown dosyaları, `PAGES/` (özellikle `_kaynak/`, `MAP.txt`, `ENVANTER.md`, `README.md`), `pages/kaynak-bandi/` (122 Artifact'ın kayıt defteri), `pages/LISTE.md`, `pages/gorsel-kararlar/` içindeki README, kaynak ve karar notları, her varyant klasörünün `source/` / `kaynak/` alt klasörü, `raporlar/ilerleme/`.
- **Kopya ya da yedek olan büyük kısım** (≈250 MB): aynı Schedule kodunun 8 MB'lık derlemeleri, atlas'ın 17 sayfası ve onun yedeği, "indir" kopyaları, zip yedekler.

---

## 1. Kök dosyalar

| Yol | Boyut | Ne | Neyin kaynağı | Durum |
|---|---|---|---|---|
| `2026-10-09-ozet.md` | 8,6 KB | 9 Ekim devir özeti: main, CI, tren, yarım kalan BL-990 (Time off e2e yavaşlığı) | Project düzenine geçişin başlangıç durumu | arşiv (9 Ekim) |
| `DURUM.md` | 9,9 KB | Mert'in okuduğu tek sayfa; 9 Ekim 06:05Z sürümü, "Seni bekleyen" B1–B24 | CLAUDE.md §6 "DURUM.md" | **eski görünüyor** (son değişiklik 9 Ekim); yine de saklanmalı |
| `MERT-KURALLARI.md` | 7,7 KB | Mert'in çalışma kuralları: koordinatör rolü, rapor zinciri, yönlendirme | Koordinatör ve thread davranışı | güncel (12 Ekim) — **saklanmalı** |
| `yerel-durum-2026-10-14.md` | 9,9 KB | Bugün (16:50) Remote Control thread'inin yazdığı yerel durum raporu: main `9b871a97`, push'lanmamış yerel dallar | Devir; Mert'in bilgisayarındaki git durumu | güncel, yeni (ilk listede yoktu, bu sırada eklendi) |
| `publish-before-1440.png`, `publish-after-1440.png`, `publish-after-390.png`, `publish-off-1440.png` | 12–20 KB (4 dosya) | Önce / sonra ekran görüntüleri (12 Ekim 20:25) | çıkarım: bir Schedule "publish" işinin kanıt görüntüleri | geçici kanıt; yanlışlıkla köke yazılmış olabilir (çıkarım) |
| `short-hours-before-1440.png`, `short-hours-after-1440.png`, `short-hours-after-390.png` | 20–27 KB (3 dosya) | Önce / sonra ekran görüntüleri (12 Ekim 20:16) | çıkarım: Important Dates "Short hours" işinin kanıt görüntüleri | geçici kanıt |

## 2. Üst klasörler (özet)

| Yol | Boyut | Dosya | Ne |
|---|---|---|---|
| `pages/` | 380 MB | 1671 | Artifact sayfalarının yayın dosyaları, varyantlar, kaynaklar |
| `notes/` | 21 MB | 282 | Thread notları, planlar, oturum özetleri, ekran görüntüleri |
| `PAGES/` | 19 MB | 166 | Uygulamanın güncel ekran haritası (route başına numaralı Artifact) |
| `uploads/` | 1,5 MB | 14 | Mert'in projeye eklediği görseller |
| `raporlar/` | 584 KB | 5 | İlerleme raporu Artifact'ı |
| `devir/` | — | — | Bu envanterin de yazıldığı devir klasörü (kapsam dışı) |

---

## 3. `PAGES/` — uygulamanın ekran haritası (güncel, ÇEKİRDEK)

Ne: Uygulamanın her adresi ayrı, numaralı bir Artifact (0.1 Shell … 12.4 Your privacy choices). Her sayfa main'deki gerçek web kodunu örnek veriyle (Harbor & Vine) çalıştırır, masaüstü 1440 ve telefon 390 yan yana. Dizin: https://claude.ai/artifact/YSQYTSXbT8CdQLGR6ozWcy. Sahibi: "PAGES ekran belgeleri" thread'i (plan: `notes/pages-belgeleri/PLAN.md`). Kural: proje talimatı #11 / CLAUDE.md §6.

| Yol | Boyut | Dosya | Ne / neyin kaynağı | Durum |
|---|---|---|---|---|
| `PAGES/00.00-index.html` … `PAGES/12.04-your-privacy-choices.html` | 20–88 KB her biri | 66 | Her ekranın kabuk sayfası (Artifact'ın kendisi); `app.html` ya da `app-schedule.html`'i iframe'de açar | güncel |
| `PAGES/app.html` | 2,9 MB | 1 | Bütün ekranların ortak derlemesi (Schedule hariç) | güncel (14 Ekim 08:19); `_kaynak/`'tan yeniden kurulur |
| `PAGES/app-schedule.html` | 9,1 MB | 1 | Schedule ekranlarının (3.0–3.2) derlemesi | güncel (14 Ekim 08:18); `_kaynak/`'tan yeniden kurulur |
| `PAGES/index.html` ve `PAGES/00.00-index.html` | 336 KB / 340 KB | 2 | İki dizin sayfası; `00.00` daha yeni (08:20), `index.html` 07:40 | `index.html` büyük ihtimalle eski kopya (çıkarım) |
| `PAGES/MAP.txt` | 8 KB | 1 | Numara, ekran, adres, Artifact linki, derlendiği main sha | **ÇEKİRDEK** |
| `PAGES/ENVANTER.md` | 380 KB | 1 | Her sayfa, parça ve senaryonun tam listesi (✅ / ❌), `dosya:satır` dayanaklı | **ÇEKİRDEK** |
| `PAGES/README.md` | 4 KB | 1 | Kural ve "bir ekranı yenilemek" adımları | **ÇEKİRDEK** |
| `PAGES/_kaynak/` | 1,9 MB | 76 | Derleme kaynağı: atlas motorunun kopyası + PAGES ekleri, `vite.config.ts`, `tools/build-pages.mjs`, `tools/screens.py`, `tools/sc/*.py` (senaryolar), `tools/pages.json` (linkler) | **ÇEKİRDEK** — bütün PAGES derlemeleri buradan kurulur |
| `PAGES/_bekleyen/` | 1,8 MB | 19 | Henüz uygulanmamış PAGES güncellemeleri: `00.04-workspace-switcher-ws-switcher` (README: "uygulandı", 14 Ekim) ve `03.03-requests-ekran02` (README: "yayınlandı", 11 Ekim; artık yalnız ekran görüntüleri) | ikisi de uygulanmış → arşiv |

## 4. `pages/` — Artifact sayfaları, varyantlar, kaynaklar

Genel düzen: Bir varyant sayfası çoğunlukla üç parçadır: küçük kabuk `index.html` + büyük `app.html` (gerçek uygulama kodunun tek dosyalık derlemesi, 2–9 MB) + `source/` (vite ile yeniden derleme kaynağı). Büyük dosya, kaynak ve GitHub'daki kod varsa yeniden kurulabilir.

Kayıt defterleri (önce bunlar okunur):
- `pages/LISTE.md` (16 KB): öbür hesaptan taşınan 14 sayfa, bu hesapta yapılanlar, eski oturumlardan kalanlar, 9 Ekim gece güncellemesi. Her satırda Artifact linki, kaynak dosya yolu, durum. **ÇEKİRDEK.**
- `pages/kaynak-bandi/artifactlar.json`: **122 Artifact'ın** kimliği, adı, klasörü (pages, schedule, giris, settings …) ve kaynağı (`project` 96, `code-bu` 13, `code-diger` 10, `belirsiz` 3). **ÇEKİRDEK.**

| Yol | Boyut | Dosya | Ne / neyin kaynağı | Durum | Thread |
|---|---|---|---|---|---|
| `pages/LISTE.md` | 16 KB | 1 | Yukarıda | güncel (14 Ekim'e kadar işlenmiş) | koordinatör / gece thread'i |
| `pages/kaynak-bandi/` | 300 KB | 7 | Artifact klasör dizini (https://claude.ai/artifact/Gqga77Bp6Dt4bmmF4Mw471) kaynağı `dizin.html` + üreten `dizin.py`; her sayfanın üstündeki "kaynak bandı"nı basan `bant.py`; kayıt betiği `kayit.py`; `ISCI-TALIMATI.md` | **ÇEKİRDEK** | — |
| `pages/gorsel-kararlar/` | 115 MB | 756 | "Bekleyen görsel kararlar" sayfası (https://claude.ai/artifact/JqDJXpTnExgEuNnjhxpimG): her ekran bir sekme. `gorsel-kararlar.html` kabuk, `kaynak/` (parçalar + `strip.py`), `inject.js`, `mkapps.py`, `gelen/` (öbür thread'lerin varyantları, aşağıda), `indir-2026-10-13/` (Mert'e indirme kopyaları) | güncel; `gelen/` büyük | /oto thread'i |
| `pages/guncel/` | 43 MB | 180 | 9 Ekim gece güncellemesinin yeni kaynakları: tek dosyalık sayfalar (`employees-list-lab.html`, `giris-tasarim-kitabi.html`, `settings-general.html`, `takas-penceresi-dugmeleri.html` …) ve klasörler (`jobs-departments/` 2,6 MB, `bildirim-varyantlari/`, `schedule-musaitlik-izin/`, `schedule-ust-cubuk/`, `schedule-vardiya-karti/`, `schedule-vardiya-pencereleri/` her biri ~8,5 MB) | karışık: `jobs-departments/` güncel (14 Ekim, sürüm 11); dört `schedule-*` klasörü **üst düzeydeki aynı adlı klasörlerin kopyası** (aşağıda) | gece thread'i (/oto) |
| `pages/atlas/` | 40 MB | 70 | Eski "Newfork sayfa atlası": 17 sayfa × 2,3 MB + `source/` (796 KB, 50 dosya; motor, sahte backend `mock/`, `vite.config.ts`) + `ENVANTER.md` + `README.md` | HTML'ler **eski** (yerini PAGES aldı); `source/` hâlâ temel (swap-c2, jobs-departments, PAGES/_kaynak ondan türedi) | "Sayfa atlası" |
| `pages/atlas-yedek-2026-10-11/` | 39 MB | 19 | Atlas'ın 17 sayfasının, Library'den silinmeden önce alınmış yedeği + `LISTE.txt` (eski linkler, main `aac05f76`) | **yedek-eski** | — |
| `pages/orijinal/` | 12 MB | 63 | "Orijinal · bugünkü uygulama" düğmesinin derlemesi (main `9a9793e2`, 9 Ekim): `today/index.html` (9,5 MB), `tuval/` (17 ekran görüntüsü), `onceki/` (eklemeden önceki sayfa kaynakları), `kaynak/` (kayıt ve geri oynatma araçları, demo dünya SQL'i) | arşiv (9 Ekim); `today/` öbür hesaptan gelen 7 sayfanın içinde yayında | — |
| `pages/schedule-test/` | 8,5 MB | 27 | "Schedule test sayfası" eski kaynağı: `index.html` (8,1 MB), `source/`, `README.md`, `KARARLAR-NOTU.md` | **eski**: bağlantısı (RNJEGWCDgdG2NpYRpWF4g3) artık birleşik sayfayı gösteriyor; README "buradan yayın yapma" diyor. `source/` başka varyantların temeli | "Schedule test sayfası" |
| `pages/schedule-birlesik/` | 26 MB | 81 | Birleşik Schedule sayfası (RNJEGWCDgdG2NpYRpWF4g3, sürüm 9–10): `index.html` + `test.html`, `ust-cubuk.html`, `vardiya-karti.html` (her biri ~8,1–8,3 MB) + üç `source-*` | güncel yayın; büyük dosyalar `source-*`'tan kurulur | /oto |
| `pages/schedule-ust-cubuk/` | 8,6 MB | 26 | Üst çubuk ve pencereler varyantları (WFnZBHaAo32rVHKDUkzXJe), madde 2, 5, 7, 8, 9 | **kopya**: `guncel/schedule-ust-cubuk/` daha yeni (9 Ekim 11:00'e karşı 09:04) | — |
| `pages/schedule-vardiya-karti/` | 8,3 MB | 22 | Vardiya kartı varyantları (2oRzMjRe1hRRgYhDzRyxJE), madde 3, 4, 10 | `guncel/` kopyası da var; burası daha yeni (12 Ekim) | — |
| `pages/schedule-musaitlik-izin/` | 8,3 MB | 24 | Müsaitlik ve izin hücreleri (37To9ekKGsDrQNSmmKYvXx) | `guncel/` kopyası da var; burası daha yeni (10 Ekim) | — |
| `pages/schedule-vardiya-pencereleri/` | 17 MB | 33 | Vardiya pencereleri (JLkkPNRt2bhD5DNSsZxWoH) eski turu: `index.html` + `yayin-2026-10-10.html` (ikisi de ~8,1 MB) | **eski**: yerini `gorsel-kararlar/gelen/vardiya-penceresi-yeni/` aldı; `guncel/` kopyası da var | "Vardiya ekleme ve düzenleme pencereleri" |
| `pages/schedule-kart-katalogu/` | 12 MB | 100 | "Bütün kart hâlleri" (S9fM4Yfc7SLhro3frLo9gL, sürüm 10): `index.html` kabuk, `app.html` (7,5 MB), `ekran/`, `source/` (vite) | güncel (14 Ekim) | "Vardiya kartı, hayalet vardiya ve sürükleme" |
| `pages/swap-c2/` | 13 MB | 76 | Takas onay penceresi Önce / Sonra (CpHTbbxgUhEqwmEfXBjGia): `original.html`, `new.html`, `new-b.html`, `emp-*.html` (her biri 2,2–2,3 MB), `h2/` görüntüler, `patch/`, `source/` | 11 Ekim; karar bekliyordu | EKRAN-02 |
| `pages/erisim-yok/` | 412 KB | 9 | Erişim yok ekranları (Xr1CkDfyGejXq74pWdmnCW), main `28aeb82b` | güncel (14 Ekim) | "Erişim yok hatası ekranları" |
| `pages/sabit-listeler/` | 3,2 MB | 11 | "Frozen List Pages" (2TT6LzGoz92k86YKHfjWvA): 9 liste sayfası + `app.html` (2,8 MB) | güncel (14 Ekim 16:43) | — |
| `pages/employees-deneme/` | 2,9 MB | 2 | "Employees deneme" + `app.html` (2,8 MB) | çıkarım: deneme sayfası; Artifact kayıt defterinde yok | — |
| `pages/vardiya-degisim-indir/` | 6,7 MB | 43 | Vardiya değişimi mockup'ının Mert'e indirme kopyası (HTML + zip) ve görüntü klasörleri (`cekmece`, `cekmece-v2`, `cekmece-v3`, `swap-v3`, `swap-v4`, `satir-cumleleri`, `yedek-2026-10-14-satirlar` …) | indirme kopyası; asıl kaynak `gorsel-kararlar/gelen/vardiya-degisim/` | "Takas kırmızı düğmeler" |
| `pages/lineup-indir/` | 3,1 MB | 13 | Lineup mockup'ı ve 9 tema çalışmasının indirme kopyaları + 2 zip | indirme kopyası; asıl `gorsel-kararlar/gelen/lineup/` | Lineup |
| `pages/musaitlik-tasarimlari/` | 1,7 MB | 4 | "Müsaitlik tasarımları" (Ci3eocAuUVopdj3nGEGebs, öbür hesaptan) | ✅ Done; tek dosya hâli `guncel/musaitlik-tasarimlari.html` | — |
| `pages/newfork-pre-business-settings/` | 508 KB | 55 | Design tuvali "Pre-business & Settings" (4AGPsoDPMS4gS9M2rup6sZ) kaynağı `project/` (`*.dc.html` çizimler) | dokunulmadı, tasarım kaynağı | — |
| `pages/newfork-design-system/` | 112 KB | 13 | Tasarım sistemi (KxiYpZDfHAUSN8KffLNxRV): `project/` (README, `tokens.json`, `design-system.json`, bileşen README'leri, logolar) | tasarım kaynağı | — |
| `pages/newfork-motion-hero/` | 80 KB | 3 | Tanıtım animasyonu (9M2NymU59pGk1qkZEiGaL2) | tanıtım; uygulamada karşılığı yok | — |
| `pages/kaynak-bandi/` | — | — | Yukarıda | — | — |
| `pages/jobs-mobil-add/` | 832 KB | 7 | Jobs / telefonda "Add" düğmesi ekran görüntüleri (`kod/` dahil) | çıkarım: kanıt görüntüleri | — |
| `pages/requests-cekmeceleri/` | 540 KB | 4 | "Requests Çekmeceleri" (ByLzLG2V1n58kEP94vNC26) + `img/` | — | — |
| `pages/backlog-listesi/` | 300 KB | 1 | "Newfork Backlog" (7EiSLRANsdm2jyeh9kzjHT), 12 Ekim | bayatlar; BACKLOG.md'den üretilir | — |
| `pages/bl-1024-varyantlar/` | 20 KB | 1 | "Requests Kayıp Talep Bağlantısı" kabuğu | asıl: `gorsel-kararlar/gelen/bl-1024-requests/` | "Eski Shift Hub yönetici ekranları" |
| `pages/atanmamis-lokasyon-varyant/` | 20 KB | 1 | "Atanmamış Lokasyon Hücresi" (PeCwcUC922XVirLhgBYfBr) | — | — |
| `pages/fb-6-7-yedek-2026-10-13.zip` | 5,7 MB | 1 | Silinen "FB-6.7 ekran varyantları" Artifact'ının yedeği (Mert 13 Ekim: "başka plan uygulandı") | **yedek** | — |
| `pages/komut-rehberi.html` | 1,4 MB | 1 | "Newfork Komut Rehberi" (NhecEzSFXPQ7FTvMjfN5su), öbür hesaptan | eski (30 Eylül ölçümü) | — |
| `pages/hayalet-kart-denemeleri.html` | 1,8 MB | 1 | Eski hayalet kart dalının inceleme sayfası (LzLBAoEfPikvF3bxop8US7) | arşiv (dal-inceleme) | — |
| `pages/sag-ust-pencere-stilleri.html` | 1,5 MB | 1 | Eski sağ üst pencere stilleri dalının inceleme sayfası (CB4PkvR1hJwmV4n4uMJMRz) | arşiv (dal-inceleme) | — |
| `pages/newfork-landing-a.html`, `-b.html`, `-preview.html` | 996 / 748 / 76 KB | 3 | Tanıtım sayfası sürümleri (öbür hesaptan) | tanıtım | — |
| `pages/tek-cekmece-prototip.html` | 472 KB | 1 | "Tek çekmece prototipi" (FXWWvxLd3T9v5Qfy4112Mm) | **kopya**: `gorsel-kararlar/gelen/announcements-important-dates/index.html` ile aynı boyut (482.661 bayt) | Important Dates çekmecesi |
| `pages/lineup-mockups.html` | 220 KB | 1 | "Lineup Mockups" (T4Heypx662YmYWSnG36yxW) | `gelen/lineup/index.html`'den farklı boyut; eski ya da ayrı sürüm (çıkarım) | Lineup |
| `pages/vardiya-degisim-mockup.html` | 116 KB | 1 | "Shift Change Mockup" (723BAcPXjhxwYePzqDGSxk) | **kopya**: `gelen/vardiya-degisim/index.html` ile aynı boyut (118.028 bayt) | "Takas kırmızı düğmeler" |
| `pages/onboarding-documents.html`, `republish-acknowledgements.html`, `employees-list-lab-h2.html`, `requests-warnings-lab-h2.html`, `list-page-systems.html` | 36–108 KB | 5 | Öbür hesaptan taşınan sayfaların ilk kaynakları | `guncel/` altında 9 Ekim gece sürümleri var → bunlar eski | — |
| `pages/bl-969-telefon-alani.html`, `telefon-kurallari.html` | 16 KB / 16 KB | 2 | BL-969 önce / sonra (7V5igYU8MrxAQanN4Tw5P5), Telefon kuralları denemesi (LPMFzbYr4Yd2fdPSDWSiio) | karar bekliyordu | "BL-969 önce ve sonra listesi" |
| `pages/important-dates-yeni-istekler.html` | 44 KB | 1 | "Important Dates yeni istekler" (S4g9JVLfFCcLW42QFPeSb3) | — | Important Dates çekmecesi |
| `pages/liste-secim-envanteri.html` | 28 KB | 1 | "Liste Seçim Envanteri" (liste sayfalarında seçim, hover, renk) | — | — |

### Aynı Schedule kodunun 8 MB'lık kopyaları (en büyük tekrar)

Bütün bunlar aynı Schedule ekranının, farklı varyant anahtarlarıyla tek dosyaya derlenmiş hâli. Her birinin yanında `source/` var, yani yeniden derlenebilir.

| Dosya | Bayt | Not |
|---|---|---|
| `pages/schedule-test/index.html` | 8.512.380 | eski test sayfası |
| `pages/schedule-birlesik/test.html` | 8.486.847 | yayındaki birleşik sayfanın parçası |
| `pages/schedule-birlesik/vardiya-karti.html` | 8.510.172 | yayında |
| `pages/schedule-birlesik/ust-cubuk.html` | 8.665.027 | yayında |
| `pages/schedule-ust-cubuk/index.html` | 8.556.364 | eş: `guncel/schedule-ust-cubuk/index.html` 8.562.056 |
| `pages/schedule-vardiya-karti/index.html` | 8.462.281 | eş: `guncel/…` 8.467.754 |
| `pages/schedule-musaitlik-izin/index.html` | 8.461.471 | eş: `guncel/…` 8.468.470 |
| `pages/schedule-vardiya-pencereleri/index.html` | 8.577.459 | eş: `guncel/…` 8.523.401 ve `yayin-2026-10-10.html` 8.526.749 |

Toplam ≈100 MB. Kaynağı ile birlikte saklanacak olanlar: `schedule-birlesik/` (yayında). Öbürleri yalnız eski sürümün kanıtı.

### `pages/gorsel-kararlar/gelen/` — thread'lerden gelen varyantlar (ikinci seviye)

| Klasör | Boyut | Dosya | Ne | Durum / not | Thread |
|---|---|---|---|---|---|
| `BL-682` | 9,1 MB | 7 | İki lokasyonun haftası ekrana sığmıyor: kabuk + `app-schedule.html` (8,5 MB) | yayınlanmamıştı | "Çok lokasyonlu haftada rozet taşması" |
| `BL-768` | 12 KB | 2 | İşten çıkarmada boşalan vardiyaların bildirimi cümlesi (A / B) | karar sorusu | — |
| `announcements-audience` | 9,1 MB | 42 | Duyuru çekmecesinin Audience sekmesi: Original / A / B / C, `app.html` (2,8 MB), `audience-mockup.html` (3,8 MB), `shots/`, `source/varyantlar.diff` | seçim bekliyordu | Important Dates çekmecesi |
| `announcements-important-dates` | 908 KB | 3 | Duyuru çekmecesinin yeni düzeni (FXWWvxLd3T9v5Qfy4112Mm) + 11 Ekim sürümü | `pages/tek-cekmece-prototip.html` bunun kopyası | Important Dates çekmecesi |
| `availability-tercih` | 1,2 MB | 18 | "Availability Mockups" + önizleme görüntüleri + `kaynak/` | — | Availability |
| `bl-1024-requests` | 6,1 MB | 22 | Requests'te bulunamayan vardiya değişikliği bağlantısı (2e9oGkM7BKsVgRHkJXwF8D); `app.html`, `tur2/app-new.html` (2,3 MB'lık iki derleme) | — | "Eski Shift Hub yönetici ekranları" |
| `erisim-karti` | 728 KB | 10 | "You don't have access" kartının varyantları | C seçildi, uygulamada | "Erişim yok hatası ekranları" |
| `ghost-kendi-rengi` | 9,4 MB | 32 | Hayalet kart kendi renginde (seçilen: I), `app.html` 8,1 MB + `source/` (vite) | karar verildi, kodda | "Vardiya kartı, hayalet vardiya ve sürükleme" |
| `job-ikonlari` | 4,2 MB | 226 | Job ikon paketi (XxfpgGwRtUH2P5jJKup5qi): `svg/` (2,3 MB), `onizleme/`, `kaynak/status.json` (keep / sil / bekliyor) | güncel; SVG'ler asıl üründür, **saklanmalı** | — |
| `jobs-cekmece-renk` | 2,1 MB | 28 | Jobs çekmecesinde renk dengesi varyantları (14 Ekim) | yeni | — |
| `kart-isaretleri-40` | 12 MB | 29 | Kart işaretleri: 40 taslak + 6 ataş; seçilen "16 · Çapraz ince ataş"; `index.html` 7,5 MB, `kaynak/` (tsx/css parçaları), `kodlandi/` görüntüler | karar verildi, kodlandı | "Vardiya kartı, hayalet vardiya ve sürükleme" |
| `lineup` | 4,4 MB | 50 | Lineup planı (`PLAN.md` 35 KB, `DEVIR-2026-10-14.md`, `kod-hazirlik.md`), mockup'lar (A liste, B kokpit, C pano), 9 tema, `kaynak/`, `kod/`, `yedek/` | güncel; **devir notu var, saklanmalı** | Lineup |
| `lineup-durumlar` | 720 KB | 1 | "Lineup States" (yükleniyor / hata; B seçildi) | karar verildi | Lineup |
| `lineup-satir` | 1,1 MB | 18 | Lineup satırı tasarımı + `kaynak/README.md` | — | Lineup |
| `lineup-telefon` | 412 KB | 3 | Add Staff penceresi yeniden tasarım ön çalışması (`ADD-STAFF-TASARIM.md`, 14 Ekim) | yeni | Lineup |
| `liste-secim-envanteri` | 860 KB | 10 | Liste seçim envanterinin görüntüleri | — | — |
| `new-schedule-tablo` | 18 MB | 67 | New Schedule penceresi: `index.html` 8,2 MB, `source/` (vite), `ekran/`, `temiz/` (5 MB), `export-akislari/`, `KARARLAR-NOTU.md` (Mert'in seçimleri) | karar notu **saklanmalı** | — |
| `org-switcher` | 1,9 MB | 11 | Sol menü tepesindeki workspace seçici: Original + 3 varyant | koda girdi (PAGES/_bekleyen 00.04) | "Sol menüdeki gizli workspace seçici" |
| `schedule-ayrilma-uyarisi` | 212 KB | 4 | Düzenleme modunda başka sayfaya geçince uyarı penceresi | — | "Schedule düzenleme modunda kaybolan ilerleme" |
| `schedule-kart-isaretleri` | 8,6 MB | 16 | Yayın işaretleri (Edited / Live) ve kart düzeni; `app.html` 7,3 MB | karar verildi (12 Ekim) | "Vardiya kartı, hayalet vardiya ve sürükleme" |
| `shift-catalog-yenileme` | 6,6 MB | 28 | Settings → Shift types yeni liste dili: Original / A / B / C; `app.html` + `secilen-a/app.html` (2,3–2,4 MB), `varyant-kodu.diff` | A seçildi (çıkarım: klasör adı) | — |
| `tek-cumle-uyarilar` | 4,2 MB | 70 | Tek cümlelik uyarılar (7pQDWftLVrPVLGuxVRLuMV), 14 Ekim | yeni | — |
| `telefon-kenar-boslugu` | 340 KB | 2 | Telefonda kenar boşluğu (A 16 px önerilen) | koda girdi (PAGES ENVANTER 68a6eaef: 16 px) | — |
| `vardiya-degisim` | 216 KB | 2 | Shift Change Mockup (`index.html`) + `v1-uc-dil.html` | asıl kaynak; plan `notes/vardiya-degisim/PLAN.md` | "Takas kırmızı düğmeler" |
| `vardiya-ikonlari` | 392 KB | 2 | Vardiya değişimi ikonları | — | "Takas kırmızı düğmeler" |
| `vardiya-penceresi-yeni` | 11 MB | 38 | Add / Edit shift penceresi yeni hâli (Form ⇄ Timeline), JLkkPNRt2bhD5DNSsZxWoH sürüm 5; `index.html` 8,3 MB + `source/` (vite) | güncel | "Vardiya ekleme ve düzenleme pencereleri" |
| `yukleme-hata` | 308 KB | 3 | Announcements ve Requests yükleme hatası görüntüleri | kanıt | — |

`pages/gorsel-kararlar/indir-2026-10-13/` (1,5 MB, 4 dosya): Mert'e indirme kopyaları (Vardiya değişimi, Lineup, Availability tercih, Workspace seçici). `2-Lineup.html` = `gelen/lineup/index.html` = `lineup-indir/Lineup-mockup.html` (üçü de 194.072 bayt).

---

## 5. `notes/` — thread notları ve planlar

Çoğu küçük markdown; kaybolması en pahalı olan kısım bu. Toplam 21 MB'ın ~16 MB'ı ekran görüntüsü.

| Yol | Boyut | Dosya | Ne | Durum | Thread |
|---|---|---|---|---|---|
| `notes/oturum-ozetleri/` | 104 KB | 11 | Eski Claude Code oturumlarının ekran ekran özeti (bkz. bölüm 9) | **ÇEKİRDEK** (9 Ekim) | oturum okuma işçileri |
| `notes/oto/` | 60 KB | 2 | `/oto` otomatik backlog turunun günlüğü (`GUNLUK.md` 52 KB) + gece dalları ve fonksiyonlar notu | **saklanmalı** (11 Ekim'den) | /oto |
| `notes/gece-isi/` | 620 KB | 14 | 9 Ekim gece işi: sayfaları güncel hâle getirme brifi, `SABAH-RAPORU.md`, sayfa sayfa notlar, Jobs ve Locations görüntüleri | arşiv; LISTE.md "Gece güncellemesi" bölümünün dayanağı | gece thread'i |
| `notes/dalda-bekleyenler/` | 8,9 MB | 28 | "Kodu yazılmış ama main'de olmayan işler" listesi (`LISTE.md`), silinecek dallar listesi (`silme-listesi.md`), görüntüler, `landing/` (4 tanıtım sürümünün tam sayfa görüntüleri, 2,7 MB'lık dahil), bir yama | listeler **saklanmalı**; görüntüler kanıt | — |
| `notes/important-dates-cekmece/` | 7,4 MB | 94 | Important Dates çekmecesi: `kapsam.md`, `KOD-PLANI.md`, `CEKMECE-DUZELTME-PLANI.md`, `TRENE-HAZIR.md` (12 Ekim), `pages-port/` (PAGES demo verisi), çok sayıda ekran görüntüsü (`audience-c/`, `audience-varyantlar/`, `dort-sekme/`, `ekran/` …) | planlar **saklanmalı** | Important Dates çekmecesi |
| `notes/envanter/` | 324 KB | 9 | "Code İlerleme Envanteri" Artifact'ının (6hyYTkzNQLeSRT4uxD9p2d) kaynağı `envanter.html` + `tarama/` (oturum tarama çıktıları, jsonl / tsv) | arşiv | — |
| `notes/eski-ajan-notlari/` | 356 KB | 77 | Emekli altı ajanın (nf-db, nf-backend, nf-test, nf-arayuz, nf-gorsel-qa, nf-planlama) son notları; README: 10 ders klasör CLAUDE.md'lerine taşındı | arşiv ("kural değildir") | — |
| `notes/vardiya-degisim/` | 28 KB | 2 | Release / cover / swap planı (`PLAN.md` 24 KB) + izinli gün karar taslağı | güncel (13 Ekim) **saklanmalı** | "Takas kırmızı düğmeler" |
| `notes/vardiya-penceresi/` | 472 KB | 5 | Yeni vardiya penceresi PAGES ve KARARLAR notları + 4 görüntü | — | "Vardiya ekleme ve düzenleme pencereleri" |
| `notes/availability/` | 12 KB | 2 | Availability keşfi ve spec / plan taslağı (13 Ekim) | güncel | Availability |
| `notes/pages-belgeleri/` | 12 KB | 1 | PAGES ekran belgelerinin planı (`PLAN.md`) | saklanmalı | "PAGES ekran belgeleri" |
| `notes/telefon-kurallari/` | 4 KB | 1 | Telefon kuralları kapsam önerisi (onay bekliyordu) | — | — |
| `notes/requests-inceleme/` | 4 KB | 1 | Requests kod incelemesi bulguları (11 Ekim, 15 bulgu) | — | — |
| `notes/mobil-klavye/` | 8 KB | 1 | Telefonda klavye açılınca ne olmalı araştırması (14 Ekim) | yeni | — |
| `notes/bl-969/` | 12 KB | 1 | BL-969 önce / sonra listesi | — | "BL-969 önce ve sonra listesi" |
| `notes/mvp/` | 28 KB | 1 | "Newfork MVP Yol Haritası" HTML sayfası | çıkarım: plan sayfası; Artifact kayıt defterinde yok | — |
| `notes/atanmamis-lokasyon/` | 12 KB | 1 | Atanmamış lokasyon hücresi varyant yaması (`.patch`) | — | — |
| `notes/bl-1011/`, `bl-723/`, `bl-960/`, `ust-cubuk/`, `employees-telefon-kenar/`, `jobs-yeni-sayfa/`, `important-dates/` | 56 KB – 780 KB | 1–6 | Yalnız önce / sonra ekran görüntüleri (adındaki işin kanıtı) | kanıt; silinse de iş kaybolmaz | — |
| `notes/sayfa-kayip-denetimi.md` | 140 KB | 1 | Sayfa sayfa kayıp ve güncellik denetimi (Schedule dışı), 9 Ekim | **saklanmalı** | "Sayfa sayfa kayıp ve güncellik denetimi" |
| `notes/schedule-kayip-ozellikler.md` | 16 KB | 1 | Mert'in 16 Schedule maddesi nerede (9 Ekim) | saklanmalı | "Kaybolan Schedule özellikleri" |
| `notes/ekran-02-swap-oturum-ozeti.md` | 20 KB | 1 | EKRAN-02 takas penceresi ve Requests tek tablo oturum özeti | saklanmalı | EKRAN-02 |
| `notes/undo-davranis.md` | 16 KB | 1 | Schedule'da Undo neyi geri alır | başvuru | — |
| `notes/project-uyum-raporu.md` | 12 KB | 1 | Kuralların Project'te çıkaracağı sorunlar (9 Ekim) | arşiv | — |
| `notes/claude-md-degisiklikleri.md` + `claude-md-project-gecis.diff` | 4 KB + 32 KB | 2 | Project düzenine geçişte CLAUDE.md farkı | arşiv | — |
| `notes/izin-listesi-2026-10-09.md` | 4 KB | 1 | `.claude/settings.json`'a eklenen 27 izin kuralı | arşiv | — |

---

## 6. `raporlar/` ve `uploads/`

| Yol | Boyut | Dosya | Ne | Durum |
|---|---|---|---|---|
| `raporlar/ilerleme/` | 584 KB | 5 | İlerleme raporu Artifact'ı (https://claude.ai/artifact/9BSKy2UUQvqQVtEnyUTKzX): `index.html` (elle), `backlog.html` (üretilir), `build_backlog.py`, `backlog.template.html`, `README.md` | kaynak; **saklanmalı** (üretici betik) |
| `uploads/hearth/` | 1,5 MB | 14 | Mert'in projeye eklediği görseller (bölüm 8) | saklanmalı (Mert'in kendi girdisi) |
| `uploads/.incoming/` | 0 | 0 | Boş geçici klasör | — |

---

## 7. Büyük ikili dosyalar (> 2 MB)

"Yeniden kurulur" = yanında `source/` ya da `_kaynak/` var ve `vite.config.ts` içeriyor; GitHub'daki kodla yeniden derlenebilir.

| Dosya | Boyut | Yeniden kurulur mu |
|---|---|---|
| `PAGES/app-schedule.html` | 9,1 MB | Evet: `PAGES/_kaynak/` |
| `PAGES/app.html` | 2,9 MB | Evet: `PAGES/_kaynak/` |
| `pages/orijinal/today/index.html` | 9,5 MB | Kısmen: `orijinal/kaynak/` kayıt araçları var, vite yapılandırması yok; demo dünyanın yeniden kaydı gerekir |
| `pages/schedule-birlesik/test.html`, `ust-cubuk.html`, `vardiya-karti.html` | 8,1–8,3 MB (3) | Evet: `source-test/`, `source-ust-cubuk/`, `source-vardiya-karti/` |
| `pages/schedule-test/index.html` | 8,1 MB | Evet: `source/` |
| `pages/schedule-ust-cubuk/index.html` | 8,2 MB | Evet: `source/` |
| `pages/schedule-vardiya-karti/index.html` | 8,1 MB | Evet: `source/` |
| `pages/schedule-musaitlik-izin/index.html` | 8,1 MB | Evet: `source/` |
| `pages/schedule-vardiya-pencereleri/index.html`, `yayin-2026-10-10.html` | 8,2 + 8,1 MB | `index.html` evet (`source/`); `yayin-2026-10-10.html` eski yayının yedeği |
| `pages/guncel/schedule-{musaitlik-izin,ust-cubuk,vardiya-karti,vardiya-pencereleri}/index.html` | 8,1–8,2 MB (4) | Evet: her birinin `source/`'u |
| `pages/schedule-kart-katalogu/app.html` | 7,5 MB | Evet: `source/` |
| `pages/gorsel-kararlar/gelen/ghost-kendi-rengi/app.html` | 8,1 MB | Evet: `source/` |
| `pages/gorsel-kararlar/gelen/new-schedule-tablo/index.html` | 8,2 MB | Evet: `source/` |
| `pages/gorsel-kararlar/gelen/vardiya-penceresi-yeni/index.html` | 8,3 MB | Evet: `source/` |
| `pages/gorsel-kararlar/gelen/BL-682/app-schedule.html` | 8,5 MB | Kısmen: vite kaynağı yok; README'ye göre main `8e787e4f` + yerel anahtarlı PAGES derlemesi |
| `pages/gorsel-kararlar/gelen/kart-isaretleri-40/index.html` | 7,5 MB | Kısmen: `kaynak/` yalnız değişen tsx/css parçaları; PAGES / kart kataloğu kaynağıyla birleşir |
| `pages/gorsel-kararlar/gelen/schedule-kart-isaretleri/app.html` | 7,3 MB | Kısmen: kaynak yok; `schedule-kart-katalogu/source/` ile aynı aileden (çıkarım) |
| `pages/gorsel-kararlar/gelen/announcements-audience/audience-mockup.html` | 3,8 MB | Hayır: tek dosya mockup |
| `pages/gorsel-kararlar/gelen/announcements-audience/app.html` | 2,8 MB | Kısmen: `source/varyantlar.diff` + PAGES kaynağı |
| `pages/gorsel-kararlar/gelen/shift-catalog-yenileme/app.html`, `secilen-a/app.html` | 2,4 + 2,3 MB | Kısmen: `varyant-kodu.diff` + PAGES kaynağı |
| `pages/gorsel-kararlar/gelen/bl-1024-requests/app.html`, `tur2/app-new.html` | 2,3 + 2,3 MB | Kısmen: PAGES derlemesi + yerel anahtar; vite kaynağı yok |
| `pages/sabit-listeler/app.html` | 2,8 MB | Kısmen: PAGES derlemesi; kaynak klasörü yok |
| `pages/employees-deneme/app.html` | 2,8 MB | Kısmen: PAGES derlemesi; kaynak klasörü yok |
| `pages/swap-c2/original.html`, `new.html`, `new-b.html`, `emp-original.html`, `emp-new.html` | 2,2–2,3 MB (5) | Evet: `source/` + `patch/` (dal sha'ları README'de) |
| `pages/atlas/*.html` | 2,3 MB × 17 | Evet: `atlas/source/` (ama artık PAGES var; gereksiz) |
| `pages/atlas-yedek-2026-10-11/*.html` | 2,3 MB × 17 | Hayır: eski yayınların yedeği (main `aac05f76`) |
| `pages/fb-6-7-yedek-2026-10-13.zip` | 5,7 MB | Hayır: silinen Artifact'ın yedeği |
| `notes/dalda-bekleyenler/landing/surum3-vkaq02-tam.png` | 2,7 MB | Hayır: ekran görüntüsü |

Sonuç: >2 MB dosyaların toplamı ≈280 MB. Bunun ≈210 MB'ı kaynağından yeniden kurulabilir; ≈80 MB'ı (atlas yedeği, fb-6-7 zip, orijinal/today, kaynaksız PAGES türevleri) yalnız yedek ya da eski sürüm.

---

## 8. Gizli değer olabilecek dosyalar

Değerler yazılmadı. `.session.json` adlı dosya yok. `*.pem`, `*.key` yok.

**`.env` dosyaları (19 adet, hepsi bayt bayt aynı):**
- `PAGES/_kaynak/.env`
- `pages/atlas/source/.env`
- `pages/schedule-test/source/.env`
- `pages/schedule-ust-cubuk/source/.env`
- `pages/schedule-vardiya-karti/source/.env`
- `pages/schedule-vardiya-pencereleri/source/.env`
- `pages/schedule-musaitlik-izin/source/.env`
- `pages/schedule-kart-katalogu/source/.env`
- `pages/schedule-birlesik/source-test/.env`, `source-ust-cubuk/.env`, `source-vardiya-karti/.env`
- `pages/guncel/jobs-departments/source/.env`, `guncel/schedule-musaitlik-izin/source/.env`, `guncel/schedule-ust-cubuk/source/.env`, `guncel/schedule-vardiya-karti/source/.env`, `guncel/schedule-vardiya-pencereleri/source/.env`
- `pages/gorsel-kararlar/gelen/new-schedule-tablo/source/.env`, `gelen/vardiya-penceresi-yeni/source/.env`
- `pages/swap-c2/source/.env`

İçerik türü: üç anahtar (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`). Anahtar değeri "demo" ile başlıyor (13 karakter). İki adres `http://127…` ya da `localhost` değil, ama içinde demo / örnek kelimesi geçen sahte adresler. Sonuç: **demo değerler, gerçek anahtar yok** (README'lerdeki "içinde yalnız sahte demo adresleri var" notuyla uyuşuyor).

**Adı "token" geçen ama gizli olmayan dosyalar** (tasarım değişkenleri):
- `pages/newfork-design-system/project/tokens.json`
- `pages/gorsel-kararlar/gelen/lineup-satir/kaynak/tokens.css`

**Açılmadan bırakılan, adı anahtar ya da ayar çağrıştıran dosyalar:**
- `pages/orijinal/kaynak/keys.mjs`
- `pages/orijinal/kaynak/postgrest.conf`

Bunlar 9 Ekim'de bulut thread'inde kurulan **yerel** demo veritabanının kayıt araçlarıdır (çıkarım: README "yerel bir veritabanına … kuruldu"). İçerikleri bu taramada kontrol edilmedi; kontrol izni verilmedi. Yeni hesaba taşımadan önce bir kez bakılmalı. Büyük ihtimalle yerel Supabase'in herkesçe bilinen demo anahtarlarıdır.

---

## 9. `uploads/hearth/` — Mert'in projeye eklediği dosyalar

Adları uzantısız kimlik. Hepsi PNG görsel. İçerikleri açılmadı.

| Dosya | Boyut | Tür | Tarih |
|---|---|---|---|
| `70ac7b59-c919-4710-8d3f-8729c1cea11e` | 4,5 KB | PNG 227×65 | 12 Ekim 11:34 |
| `6fd77ce6-a477-4190-968d-516922c274d2` | 6,7 KB | PNG 225×118 | 12 Ekim 11:45 |
| `8a630711-3706-47a0-be2a-583a27558333` | 262 KB | PNG 1920×1080 | 12 Ekim 17:43 |
| `9e4328b9-f903-46e6-a2da-a67ad471b6f8` | 239 KB | PNG 1440×900 | 12 Ekim 22:23 |
| `cd48a96c-9298-4e34-b006-8b21ebab5e64` | 240 KB | PNG 1440×900 | 12 Ekim 22:24 |
| `03b61303-5caa-48ea-ae10-c479cbe2dcd3` | 41 KB | PNG 380×386 | 13 Ekim 10:23 |
| `41ebfc2f-01e6-4575-828f-a02ee2de98c7` | 31 KB | PNG 380×282 | 13 Ekim 10:23 |
| `5f618af5-8647-436f-a22f-f4b4feaa2206` | 30 KB | PNG 380×282 | 13 Ekim 10:23 |
| `62c75a96-855a-4576-a6cf-579935145685` | 31 KB | PNG 380×284 | 13 Ekim 10:23 |
| `6c7a03d3-ac59-4c9f-a2b6-ef4f7bb679d4` | 31 KB | PNG 380×282 | 13 Ekim 10:23 |
| `0158eb44-7d57-4e43-8260-e50822b69d78` | 220 KB | PNG 1620×1142 | 13 Ekim 13:07 |
| `283227ae-ec5a-4cc6-930a-caf9299b49e6` | 185 KB | PNG 980×980 | 14 Ekim 07:54 |
| `d444f127-c193-4617-b43c-13b0947b479a` | 139 KB | PNG 980×980 | 14 Ekim 07:54 |
| `f25e8c9c-abd4-426c-8f5e-3e9c4bd8a60c` | 55 KB | PNG 390×280 | 14 Ekim 07:54 |

Not: Hangi mesaja eklendikleri buradan görünmüyor. Yeni hesaba taşırken uzantısı `.png` yapılırsa açılırlar.

---

## 10. `notes/oturum-ozetleri/` — oturum özetleri (devir için önemli)

Klasör var: 11 dosya, 104 KB, hepsi 9 Ekim 10:04–10:35 arası yazılmış. Kaynakları, Mert'in hesabındaki eski Claude Code bulut oturumları (7–9 Ekim). Bu oturumlar yeni hesapta görünmeyecek; kararların oturumdaki izi yalnız bu dosyalarda.

| Dosya | Boyut | Ne |
|---|---|---|
| `ENVANTER.md` | 9,8 KB | 42 bulut oturumunun listesi: başlık, tarih, ekran, tasarım sayfası, Mert'in seçimi, hangi özet dosyasının kapsadığı. 7 Ekim öncesi yerel oturumların görünmediğini de yazar |
| `koordinator.md` | 8,2 KB | Koordinatör ve yardımcı oturumlar (GUVENLIK-A, PARALEL-1, OTOMASYON-3): tasarım girdileri az; iş akışı, CI, makine, iki hesap konuları |
| `ekran-01-schedule.md` | 6,1 KB | Schedule: tek aktarılan Mert kararı BL-974 ("by role" + Jobs süzgeci), tasarım sayfası yok, kanıt PNG'leri |
| `schedule-eski-kararlar.md` | 7,5 KB | 9 Ekim öncesi Schedule kararları: hangi konuda Mert'in açık seçimi var, hangisinde yok (hayalet, sürükleme renkleri, üst çubuk, TIME OFF hücresi, şablon Overwrite) |
| `ekran-03-employees.md` | 7,5 KB | Employees: telefon kartı seçimi (kodda yok), BL-503 / BL-969, main'de kalan iki telefon numarası hatası |
| `ekran-08-important-dates.md` | 11 KB | Important Dates çekmecesi: A + L1 seçimi, veri modeli değişikliği gereği, ACIL-40001, kaybolma riskli "History" sekmesi |
| `ekran-10-general.md` | 7,9 KB | Settings → General: "hiçbirini beğenmedim", SORULAR G1 ile DURUM B6 farkı, BL-178 |
| `ekran-10-jobs.md` | 11 KB | Settings → Jobs: kararlar yalnız tasarım sayfasında ve kayıtta; cevapsız 4 + 1 soru; kaynak dosyalar yalnız Mert'in PC'sinde |
| `ekran-10-locations.md` | 6,4 KB | Settings → Locations: A seçildi, kod işi açılmadı, 15 px kayma sorusu (BL-953) |
| `ekran-16-giris.md` | 9,9 KB | Giriş ve katılım: keşifte 15 seçim, tasarım kitabında 0 seçim, giriş modeli kararı ertelendi (S-118) |
| `bildirim.md` | 6,2 KB | Bildirim sistemi: aşama 1 main'de, 6 temel model sorusu ve varyant seçimi cevapsız, söküm başlamadı |

---

## 11. Önerilen taşıma sırası (yeni hesap için)

1. **Kesin taşı (küçük, kaybı geri gelmez):** kök `*.md`, `notes/**/*.md` ve `.diff` / `.patch`, `notes/oturum-ozetleri/`, `notes/oto/`, `PAGES/` (`_bekleyen/` hariç olabilir), `pages/LISTE.md`, `pages/kaynak-bandi/`, `pages/gorsel-kararlar/` içindeki `README.md`, `PLAN.md`, `DEVIR-*.md`, `KARARLAR-NOTU.md`, `kaynak/`, `status.json`, `job-ikonlari/svg/`, `raporlar/ilerleme/`, `uploads/hearth/`. Toplam ≈25–30 MB.
2. **Taşı, yeniden derlemek için:** her varyant klasörünün `source/` / `source-*` / `kaynak/` alt klasörü ve yanındaki README (her biri 0,2–1,2 MB).
3. **İstersen taşı (kanıt görüntüleri):** `notes/` ve `pages/` altındaki PNG klasörleri.
4. **Taşıma gerekmez (kopya ya da yeniden kurulur):** `pages/atlas/*.html`, `pages/guncel/schedule-*/index.html`, `pages/schedule-{test,ust-cubuk,vardiya-karti,musaitlik-izin,vardiya-pencereleri}/index.html`, `*-indir/`, `gorsel-kararlar/indir-2026-10-13/`, `pages/tek-cekmece-prototip.html`, `pages/vardiya-degisim-mockup.html`, `PAGES/index.html`.
5. **Yedek olarak bir kez arşivle, sonra karar ver:** `pages/atlas-yedek-2026-10-11/`, `pages/fb-6-7-yedek-2026-10-13.zip`, `pages/orijinal/today/`.

## Ek (Hesap devri thread'i, sonradan kontrol)
`pages/orijinal/kaynak/keys.mjs`, `gateway.mjs`, `postgrest.conf` ve `record.mjs` içine bakıldı: yerel test sunucusunun imza anahtarı ve test dünyasının ortak şifresi yazılı (repoda yoklar). Devre giden kopyalarda (GitHub dalı ve bilgisayardaki tam yedek) bu değerler `[GIZLI-CIKARILDI]` yapıldı. `pages/orijinal/today/index.html` içindeki 8 süresi dolmuş test oturum anahtarı da kopyalarda "REDACTED". Eski projedeki asıl dosyalara dokunulmadı.
