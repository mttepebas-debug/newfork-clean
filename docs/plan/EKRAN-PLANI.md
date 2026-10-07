# Ekran planı — ekran ekran ilerleme (aktif plan)

Mert'in talimatı, 2026-10-05 ~19:40Z: "Ekran ekran bir plan yapalım. Bir ekrana başlayalım, komple bitirelim."
Seçimler (aynı gün, üçü de önerilen; KOORDINATOR-KARARLARI KK-157):
1. İlk ekran **Schedule**.
2. Bir ekranın **eski açık backlog maddeleri de** o turda yapılır. Dışarıda kalan iki tür madde var, ikisi de adıyla yazılır: başka bir ekranı bekleyenler ve Mert'in büyük karar vereceği maddeler.
3. Bu plan **tek aktif plan**. Eski sıradaki işler ait oldukları ekrana girer:
   - Takas (FB-6.4) → Requests ve Shift Hub.
   - Yayın öncesi güvenlik paketi → ilgili ekranlar.
   - Ekrana bağlı olmayan CI işi (ör. BL-562) yalnız main'i kırmızıya çevirirse araya girer.
   - Ciddi güvenlik açığı bulunursa beklemeden düzeltilir (ILKELER P17).

Ek talimat (Mert, aynı gün ~19:55Z): "ekranları explore eden ajanların bulgularını ekran ekran kaydet repoda elimizin altında kalsın".

FOUNDATION-B ve `ILERLEME-PLANI.md` (artık `docs/archive/`) kayıt olarak durur; kalan işleri ekranlara dağılır.

## Bir ekranın turu
1. **Keşif.** Dört alt ajan aynı anda çalışır, hiçbiri kod değiştirmez:
   - kod ve davranış: hatalar, KARARLAR'a uymayan eksikler, test boşlukları;
   - güvenlik ve yetki (`nf-guvenlik`);
   - görsel: masaüstü ve telefon, tutarlılık, erişilebilirlik (genel ajan, gerçek uygulamada ekran görüntüsüyle);
   - açık backlog maddeleri, tazelik ölçümüyle, ve prototip farkları, "taşı / bırak" önerisiyle (`nf-okur`).
2. **Kayıt.** Raporlar olduğu gibi repoya girer: `docs/plan/ekranlar/<no>-<ekran>/` klasörüne, her ajan için bir dosya (`A-backlog-prototip.md`, `B-guvenlik.md`, `C-gorsel.md`, `D-kod-davranis.md`) ve bir `OZET.md`. Özet, bulguları tek listede toplar; Mert'in seçimleri ve kapanış durumu da oraya yazılır.
3. **Konuşma.** Mert'e özet gider: bulgular ve taşı / bırak listesi. Seçimler tıklamalı yapılır. Görsel kararlar gerçek ekranda varyantla verilir (P04). Davranış kuralları önce sohbette konuşulur (P18).
4. **Ekran dosyası ve kabul listesi** (Mert, 2026-10-07; ILKELER P17). `docs/plan/ekranlar/<no>-<ekran>/EKRAN.md` açılır: keşiften, `OZET.md`'den ve KARARLAR'dan çıkan **tek** kabul listesi. Görev dosyası açılmaz; risk sınıfı madde başına yazılır.
   - **Tek defter:** ekranın açık backlog maddeleri listeye taşınır ve `BACKLOG.md`'den çıkar (maddenin altına "EKRAN-<no> listesine taşındı <tarih>"). İş yalnız listede izlenir.
   - **Onay:** Mert listeyi başlamadan tek turda onaylar; liste sonradan yalnız Mert'in kararıyla değişir.
   - **Biçim:** `| # | Davranış (kim, ne yapar, ne görür) | Sınıf | Kanıt (test adı / ekran görüntüsü) | Durum |`. Durum: ⏳ açık · ✅ `<sha>` · ⏭ BL-xxx (Mert'in onayı, tarih).
5. **Uygulama: tek sahip oturum.** Listeyi bir oturum veritabanından ekrana uçtan uca işler; dokunduğu klasörün `CLAUDE.md`'si (`supabase/`, `apps/api/`, `apps/web/`, `e2e/`) kendiliğinden okunur.
   - **Madde döngüsü:** önce kırmızı test → kod → yeşil → listede ✅ ve commit sha.
   - **Durum dosyada yaşar:** bağlam dolarsa oturum temizlenir ve listeden devam eder.
   - **İkinci oturum** yalnız birbirinden bağımsız maddeler için, sahip isterse açılır.
   - **İnceleme** madde başına değil iş sınırında, listedeki en yüksek sınıfa göre (`CLAUDE.md` §4.3; R3 madde varsa `nf-guvenlik` zorunlu).
   - Yolda bulunan, listede olmayan şey listeye eklenmez, rapora yazılır (`CLAUDE.md` §4.3 madde 5).
6. **Kapanış.** Ekran, listede ⏳ kalmayınca biter. Her madde ya ✅ (kanıt + sha) ya ⏭ (Mert'in onayıyla backlog'a, BL numarasıyla). "Başka dilime ya da oturuma bırakıldı" hâli yoktur. Görsel maddeler ekran görüntüsüyle kanıtlanır; kapanışta Mert bir tur bakar, itiraz ettiği madde ⏳'e döner. Ardından tam kapı ve main CI yeşil, "Sonrası için" maddeleri damıtılır (aşağıda), kısa rapor gider, sonraki ekrana geçilir.

### Uygulama arşivi ve damıtma (Mert, 2026-10-06: "token ve zaman harcamışken bulgular unutulacağına dokümante edilip saklansın"; format koordinatörün, KK-163)
- **Arşiv (değişmez):** `docs/plan/ekranlar/<no>-<ekran>/uygulama/<dilim>.md` (ör. `01-schedule/uygulama/W-1a.md`, `02-requests/uygulama/A0.md`). Varyant ve ölçüm raporları da (`VAR.md`, `DRAG-olcum.md`). İşi yapan oturum dosyayı **kendi dilim commit'ine** ekler; ek gönderim yok. Sonradan düzeltilmez: tarihli, sha'lı "o anki fotoğraf".
- **Dosyanın biçimi:**
  1. Künye tablosu: ekran | dilim | oturum | sınıf | inceleme kararı (`ONAY @sha`, kim) | tarih. Main sha'sı ve CI koşusu gönderimden sonra bilindiği için dosyada değil; OZET'teki uygulama kaydına yazılır.
  2. `## Sonrası için` — en çok 5 madde, her biri tek cümle; yoksa "yok". Türleri: **Tuzak** (zaman yediren şey + nasıl önlenir), **Kalıp** (tekrar kullanılacak komut, yol, test deseni), **Ölçüm** (değer + nerede + tarih + sha), **Karar adayı** (kural olabilecek şey). Rolün bir sonraki oturumunun bilmesi gereken şey burada.
  3. `## Rapor` — koordinatöre giden rapor, olduğu gibi.
  4. `## İnceleme` — her inceleme (güvenlik, kod, görsel) kendi alt başlığıyla, olduğu gibi; KARAR satırı en üstte.
- **Damıtma (ekran kapanınca, koordinatör):** "Sonrası için" maddeleri kendiliğinden okunan yerlere taşınır — Tuzak ve Kalıp ilgili klasörün `CLAUDE.md`'sine (`supabase/`, `apps/api/`, `apps/web/`, `e2e/`; o klasörde çalışan her oturum kendiliğinden okur); Karar adayı KARARLAR'a ya da Mert'e soruya; Ölçüm ilgili backlog maddesine. OZET'e "Uygulama kaydı" tablosu: dilim | etkisi (tek cümle) | main sha | CI | arşiv dosyası.
- **Neden böyle:** ham rapor aylar sonra baştan sona okunmaz; değeri birkaç cümlelik derste. Ders kendiliğinden okunan yere taşınmazsa kullanılmaz. Kodu anlatan kısım ilk eskiyen kısım olduğu için arşiv tarihli kalır, güncellenmez.
- Yolda çıkan ve ekranın önünde olmayan iş `BACKLOG.md`'ye yazılır: grubuyla ve iki işaretle (`leave` / `do`).
- Bütün ekranlar bitince genel değerlendirme (recap) yapılır.

### Keşif şablonu (her ekranda aynı dört görev)
Ortak kurallar, dördü için:
- **Salt okuma.** Yerel DB'de yalnız SELECT, commit yok. Rapor ajanın son mesajıdır; ekran oturumu onu olduğu gibi `docs/plan/ekranlar/<no>-<ekran>/` altına yazar.
- **Ekranın sınırı açıkça yazılır:** hangi rotalar içeride, komşu ekranlardan hangileri dışarıda. Sınırda kalan madde "sınırda" diye ayrı listelenir.
- **Her bulgu** `BACKLOG.md`'deki açık maddelerle eşlenir: varsa BL numarası, yoksa "YENİ".
- **Rapor dili:** Türkçe, kod okumayan biri için (CLAUDE.md §4.4).
- **Her bulgu şunları taşır:** önem, ekranda nerede, isimli örnek, kanıt (dosya:satır / SELECT / ekran görüntüsü), işaret `leave / do`.

Dört görev:

| Dosya | Ajan | Ne arar |
|---|---|---|
| `A-backlog-prototip.md` | `nf-okur` | **Açık backlog maddeleri:** ekrana ait olanların hepsi, her biri için tazelik hükmü (geçerli / değişmiş / bayat / ölçülmedi). **Prototip farkları:** her biri için taşı / bırak / varyant gerekir önerisi ve dayanağı (prototip klasöründe `KANONIK.md`'yi okur; prototipe yazmaz). **KARARLAR'da olup kodda olmayan kurallar.** |
| `B-guvenlik.md` | `nf-guvenlik` | Yetki kapısının çekirdek üzerinden işlemesi; RLS ve grant'lar; `*_service` sınıflandırması; ikiz ve eski fonksiyonlar; kapsam kuralı M2 (müdür yalnız kendi lokasyonu); sızıntı ve veri kaybı; web'de `can()` kullanımı. En üstte "DENETİM SONUCU". |
| `C-gorsel.md` | genel ajan (ekran görüntüsüyle) | Gerçek uygulamada owner ve tek lokasyon müdürü, masaüstü 1440 ve telefon 390, bütün durumlar ve pencereler. CLAUDE.md §2.A'daki tutarlılık ve buton dili, WCAG AA, klavye ve odak, KARARLAR'daki ekran kararları. Ekran görüntüleri `artifacts/EKRAN-<ad>/` altına. Ekran oturumunun kendi portu kullanılır (CLAUDE.md §6). |
| `D-kod-davranis.md` | genel ajan (opus) | Akışları uçtan uca izler (web → API → DB). KARARLAR ve ILKELER'e uymayan davranışı, ikiz ve ölü kodu, ekrana çıkan ham hata metnini, sessizce düşen veriyi, saat dilimi ve yarış durumlarını arar; test boşluklarını listeler. Kanıtlanamayanlar ayrı listede. |

`OZET.md` (ekran oturumu yazar):
- dört raporun tek listesi, önem sırasıyla;
- Mert'e sorulacak kararlar (CLAUDE.md §5 şablonu);
- prototipten taşı / bırak listesi;
- daha sonra Mert'in seçimleri ve kapanış durumu.

**Bir ekran ne zaman bitmiş sayılır:** `EKRAN.md` listesinde ⏳ kalmadığında ("Bir ekranın turu" 6). Keşif bulguları, Mert'in "taşı" dediği prototip maddeleri ve ekranın açık backlog maddeleri listeye madde olarak girdiği için ayrıca sayılmaz.

## Uygulama düzeni: hatlar (koordinatör kararı 2026-10-06, KK-161; Mert "en doğru kararı sen ver")
**Yerini aldı (Mert, 2026-10-07; ILKELER P17):** ekran işi tek sahip oturumla yürür ("Bir ekranın turu" 5). Aşağıdaki hat düzeni yalnız şu an sürmekte olan dilimler bitene kadar geçerlidir; hatta yeni dilim açılmaz. Bir ekranın kalan işi, o ekranın `EKRAN.md` listesine taşınır.
Schedule ve Requests paralel yürür, ama işler ekrana göre değil **hatta** göre dağılır. Bilgisayar tek (aynı anda tek ağır koşu, `CLAUDE.md` §4.2) ve iki ekranın veri işi aynı yetki ve test dosyalarına dokunuyor.
- **Veri hattı** (tek `nf-db` oturumu): iki ekranın veri ve güvenlik dilimleri önem sırasıyla — EKRAN-02 A0 (talep kaybı) → EKRAN-01 DB-1a → DB-1b → DB-2 → DB-3 → EKRAN-02 A1 → A2 → A3 → EKRAN-01 DB-4 → DB-1c (W-1b gerektirirse).
- **Web hattı** (tek `nf-backend` oturumu): EKRAN-01 W-1a → BE-1 → BE-2 → W-1b (DB-1b + DB-2 bitince) → EKRAN-02 B1 (A1–A3 bitince) → B2.
- **Arayüz hattı** (tek `nf-arayuz` oturumu): önce iki ekranın görsel varyantları (EKRAN-01 VAR, EKRAN-02 V; main'e girmez), sonra DRAG ölçümü, sonra bağımlılıkları açılan görsel dilimler (EKRAN-01 W-3/W-2/W-4/W-5, EKRAN-02 C1/C2/C3).
- **Sıra güncellemesi (koordinatör kararı 2026-10-06, KK-174):** veri hattı EKRAN-02 A1 → A2 → A3 → A4, sonra EKRAN-03 A1 → A2 → A3 → A4 (aynı test dosyaları; ekran ekran). Web hattı EKRAN-02 B1 → B2 → B3, sonra EKRAN-03 B1 → B2. Arayüz hattı VAR-E2E-2, sonra EKRAN-02 C3 → C1 → C2, sonra EKRAN-03 V / C1 / C2.
- **Planlama** (havuz oturumu, kısa işler): FB-6.4.md eşlemesi, keşfin YENİ bulgularına BL numarası, sonraki ekranların keşfi.
- Görsel varyantlar kodlamayla aynı gün başlar, görsel dilimlerden önce Mert'e gösterilir (P04); veri ve oturum dilimleri seçimi beklemez.
- Ölçüt: ilk dilimlerden sonra veri hattı darboğazsa ve makine boşsa ikinci veri oturumu açılır; ölçmeden açılmaz.
- Sıcak dosyalar (aynı anda tek oturum): `SchedulePage.tsx`, `styles.css`, yetki matrisi / katalog test dosyaları, `ci-green.txt`. Oturum başlamadan panoya bakar.

## Ekranlar ve durum
Durum değerleri: sırada / keşif / karar / uygulama / bitti.

| # | Ekran (uygulamadaki adı) | Kim | Prototip karşılaştırması | Durum |
|---|---|---|---|---|
| 1 | Schedule (+ Export, Templates) | owner, müdür | `research/PROTOTIP-SCHEDULE-2026-10-05.md` | uygulama — **ikinci hat (Mert 2026-10-07: "başka bir session'a en önemli tasklerden birini ver", KK-191)** — tek sahip oturum açılıyor; önce tazelik + `EKRAN.md`, iş kaybı ve UTC hafta hataları önde; DB-4 EKRAN-02 veri paketini bekler · 12/19 dilim main'de (+11 ek dilim: BE-2b, TEL-KAPALI, CI-HIZ, VAR-UYG, UNDO-db-bulgu…); kalan DB-4, W-2, W-3, W-4, W-5, T-1, K-1, Z; 6 açık soru cevaplandı (KARARLAR Schedule 2026-10-06); kapanış ölçümü `ekranlar/01-schedule/KAPANIS-OLCUMU-2026-10-06.md` |
| 2 | Requests (izin, takas, devir) | owner, müdür | proto-audit P1 | **sıradaki (Mert 2026-10-07: "Önce Requests")** — tek sahip oturum açılıyor; önce dal envanteri + `EKRAN.md` kabul listesi, Mert onayıyla uygulama · keşif ve kararlar bitti (KK-158), görev dosyası yazıldı (`tasks/EKRAN-02-REQUESTS.md`, 2026-10-06), 2 açık soru |
| 3 | Employees (+ Archive, kişi çekmecesi) | owner, müdür | P2 | **üçüncü hat (Mert 2026-10-07: "1 session daha aç ve bir task daha ver", KK-192)** — tek sahip oturum; önce tazelik + `EKRAN.md`, iş kaybı hataları önde; veri dilimleri ve matris EKRAN-02 paketinden sonra · karar — görev dosyası hazır (`tasks/EKRAN-03-EMPLOYEES.md`, 2026-10-06), 1 açık soru (Q1 Mert'e); G2 telefon konuşmasında |
| 4 | Availability | owner, müdür | P2 | keşif — A, B, D raporları ve OZET yazıldı (2026-10-06, `ekranlar/04-availability/`); C (görsel QA) makine boşalınca; 3 Mert sorusu, 6 koordinatör önerisi · sayfalama (25 / 50 / 100) bu turda: Availability (Mert 2026-10-06, BL-787) |
| 5 | Workspace (ana sayfa) | owner, müdür | P1 | karar — keşif ve koordinatör kararları bitti (KK-179), görev dosyası yazıldı (`tasks/EKRAN-05-WORKSPACE.md`, 2026-10-06; hat sırası EKRAN-04'ten sonra), BL-804…818; C (görsel QA) izinle; 6 Mert sorusu (S1–S6) |
| 6 | Documents | owner, müdür | P2 | karar — keşif ve koordinatör kararları bitti (KK-180), görev dosyası yazıldı (`tasks/EKRAN-06-DOCUMENTS.md`, 2026-10-06; hat sırası EKRAN-05'ten sonra), BL-821…837; C (görsel QA) izinle; 10 Mert sorusu (S1–S10, ekran 6 turunda) · sayfalama (25 / 50 / 100) bu turda: Settings → Documents ve Employees → Documents (Mert 2026-10-06, BL-787) |
| 7 | Announcements | herkes | P4 | karar — keşif (A, B, D + OZET, `ekranlar/07-announcements/`) ve KK-182 bitti, görev dosyası yazıldı (`tasks/EKRAN-07-ANNOUNCEMENTS.md`, 2026-10-06; FB-6.7 duyuru kısmının yerine geçer; hat sırası EKRAN-06'dan sonra), BL-858…878; C (görsel QA) izinle; 3 Mert sorusu (S1, S3, S4) ekran 7 turunda, S2 = SABAH S25 · sayfalama (25 / 50 / 100) bu turda: Announcements (Mert 2026-10-06, BL-787) |
| 8 | Important Dates | owner, müdür | P4 | sırada · sayfalama (25 / 50 / 100) bu turda: Important Dates (Mert 2026-10-06, BL-787) |
| 9 | Notifications | herkes | P4 | sırada · sayfalama (25 / 50 / 100) bu turda: Notifications (Mert 2026-10-06, BL-787) |
| 10 | Settings (General, Locations, Jobs, Notifications, Schedule rules, Conflict handling, Shift catalog, Roles & permissions, Documents, Acknowledgements, Support) | owner, admin | P3, PROTO-ESIT-SET | sırada |
| 11 | Employee view → Home | çalışan | P5, PHONE-EMP | sırada |
| 12 | Employee view → Schedule | çalışan | EMP-SCHED | sırada |
| 13 | Employee view → Shift Hub | çalışan | P5 | sırada |
| 14 | Employee view → My Availability | çalışan | P5 | sırada |
| 15 | Account (Profile, Security, Inbox, Preferences, Notifications, Workspaces, Documents) | herkes | P5 | sırada |
| 16 | Giriş ve katılım (Sign in, şifre sıfırlama, hesap kurtarma, davet kabulü, Workspaces, owner ve çalışan kurulumu) | herkes | Q1–Q4, PHONE-AUTH | keşif (2026-10-07, KK-195; salt okur, dört ajan, `ekranlar/16-giris-katilim/`) |
| 17 | Yasal sayfalar (Privacy, Terms, Accessibility, Contact, Your privacy choices) | herkes | Q5 | sırada |
| 18 | Billing (plan, kart, fatura; deneme bitince ödeme) | owner | — (KARARLAR "MVP sınırı", Mert 2026-10-07) | sırada |

**Sıranın gerekçesi:** önce müdür ve owner ekranları (ILKELER A, MVP önceliği), sonra çalışan, sonra hesap ve giriş, en son ödeme (Stripe canlı hesap için yasal sayfalar önce hazır olmalı; Mert 2026-10-07).
- Prototip denetim dosyaları (P1–P5, Q1–Q5, PHONE-*, EMP-SCHED) repo dışında: `C:\Users\TheWe\Documents\Codex\newfork-prototype\proto-audit\`.
- Prototipe yazılmaz, yalnız kaynak olarak okunur (KK-156).

**Kapsam dışı:**
- Yalnız geliştirmede açılan deneme sayfaları (`/dev/*`).
- MVP sonrası konular (`CLAUDE.md` §1 Vizyon).

## İlerleme kaydı
- 2026-10-05 ~19:50Z — Plan kabul edildi. Schedule keşfi başladı: dört alt ajan (backlog/prototip, güvenlik, görsel, kod/davranış). Raporlar gelince `docs/plan/ekranlar/01-schedule/`.
- 2026-10-05 ~20:00Z — Mert: "2. sayfa için yeni bir sessiona görev ata". Requests ayrı bir ekran oturumunda paralel başladı (ILKELER P17: ikinci işi Mert açar). Kurallar:
  - **Konuşma:** ekran oturumu keşfi bitirir, raporu koordinatöre yollar; Mert'e sorular koordinatörden gider.
  - **Sınır:** Schedule ile ortak dosyada iki oturum aynı anda yazmaz.
  - **Kayıt:** `BACKLOG.md`'yi ve bu dosyayı yalnız koordinatör yazar.
- 2026-10-06 ~01:45Z — İki ekranın görev dosyaları yazıldı ve main'e alındı (KK-160). Aynı turda Mert koordinatörü işçilikten çıkardı (KK-159): görev dosyalarını bundan sonra planlama oturumu yazar, uygulama ve main'e gönderim işi yapan oturumdadır.
- 2026-10-06 ~02:45Z — Mert: sıradaki ekranın keşfi Schedule ve Requests kodlanırken başlasın (önerilen). Employees keşfi planlama oturumunda başladı.
- 2026-10-06 ~03:10Z — Uygulama arşivi ve damıtma kuralı (KK-163).
- 2026-10-06 ~03:00–06:40Z — Uygulama başladı (dört hat). Main'de ve canlıda: EKRAN-02 A0; EKRAN-01 DB-1a, W-1a, BE-1, BE-2, DRAG-API, DRAG-UI, TEL-KAPALI; CI-HIZ. Gönderimde: DB-1b, BE-2b-DB, TEL-KAPALI-2. Varyant turu 1 karara bağlandı (KARARLAR Schedule); canlı inceleme sayfası `var.html` (arayüz hattı). Ekran 3 Employees keşfi main'de (`7eb3dc0d`), karar turu bekliyor.
