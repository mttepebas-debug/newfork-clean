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

FOUNDATION-B ve `ILERLEME-PLANI.md` kayıt olarak durur; kalan işleri ekranlara dağılır.

## Bir ekranın turu
1. **Keşif.** Dört alt ajan aynı anda çalışır, hiçbiri kod değiştirmez:
   - kod ve davranış: hatalar, KARARLAR'a uymayan eksikler, test boşlukları;
   - güvenlik ve yetki (`nf-guvenlik`);
   - görsel: masaüstü ve telefon, tutarlılık, erişilebilirlik (`nf-gorsel-qa`);
   - açık backlog maddeleri, tazelik ölçümüyle, ve prototip farkları, "taşı / bırak" önerisiyle (`nf-planlama`).
2. **Kayıt.** Raporlar olduğu gibi repoya girer: `docs/plan/ekranlar/<no>-<ekran>/` klasörüne, her ajan için bir dosya (`A-backlog-prototip.md`, `B-guvenlik.md`, `C-gorsel.md`, `D-kod-davranis.md`) ve bir `OZET.md`. Özet, bulguları tek listede toplar; Mert'in seçimleri ve kapanış durumu da oraya yazılır.
3. **Konuşma.** Mert'e özet gider: bulgular ve taşı / bırak listesi. Seçimler tıklamalı yapılır. Görsel kararlar gerçek ekranda varyantla verilir (P04). Davranış kuralları önce sohbette konuşulur (P18).
4. **Görev dosyası.** `docs/plan/tasks/EKRAN-<ad>.md` açılır; ne zaman bitmiş sayılacağı ölçülebilir yazılır, risk sınıfı belirtilir (`DELEGASYON.md`).
5. **Uygulama ve inceleme.** İşi rol ajanları yapar, risk sınıfına göre incelenir, tam kapıdan geçer, main'e alınır.
6. **Kapanış.** Ekran "bitti" diye işaretlenir; kanıtlar görev dosyasına ve `OZET.md`'ye yazılır; kısa rapor gider; sonraki ekrana geçilir.
- Yolda çıkan ve ekranın önünde olmayan iş `BACKLOG.md`'ye yazılır: grubuyla ve iki işaretle (`leave` / `do`).
- Bütün ekranlar bitince genel değerlendirme (recap) yapılır.

### Keşif şablonu (her ekranda aynı dört görev)
Ortak kurallar, dördü için:
- **Salt okuma.** Yerel DB'de yalnız SELECT, commit yok. Rapor ajanın son mesajıdır; ekran oturumu onu olduğu gibi `docs/plan/ekranlar/<no>-<ekran>/` altına yazar.
- **Ekranın sınırı açıkça yazılır:** hangi rotalar içeride, komşu ekranlardan hangileri dışarıda. Sınırda kalan madde "sınırda" diye ayrı listelenir.
- **Her bulgu** `BACKLOG.md`'deki açık maddelerle eşlenir: varsa BL numarası, yoksa "YENİ".
- **Rapor dili:** Türkçe, kod okumayan biri için (CLAUDE.md §10).
- **Her bulgu şunları taşır:** önem, ekranda nerede, isimli örnek, kanıt (dosya:satır / SELECT / ekran görüntüsü), işaret `leave / do`.

Dört görev:

| Dosya | Ajan | Ne arar |
|---|---|---|
| `A-backlog-prototip.md` | `nf-planlama` | **Açık backlog maddeleri:** ekrana ait olanların hepsi, her biri için tazelik hükmü (geçerli / değişmiş / bayat / ölçülmedi). **Prototip farkları:** her biri için taşı / bırak / varyant gerekir önerisi ve dayanağı (prototip klasöründe `KANONIK.md`'yi okur; prototipe yazmaz). **KARARLAR'da olup kodda olmayan kurallar.** |
| `B-guvenlik.md` | `nf-guvenlik` | Yetki kapısının çekirdek üzerinden işlemesi; RLS ve grant'lar; `*_service` sınıflandırması; ikiz ve eski fonksiyonlar; kapsam kuralı M2 (müdür yalnız kendi lokasyonu); sızıntı ve veri kaybı; web'de `can()` kullanımı. En üstte "DENETİM SONUCU". |
| `C-gorsel.md` | `nf-gorsel-qa` | Gerçek uygulamada owner ve tek lokasyon müdürü, masaüstü 1440 ve telefon 390, bütün durumlar ve pencereler. CLAUDE.md §9'daki tutarlılık ve buton dili, WCAG AA, klavye ve odak, KARARLAR'daki ekran kararları. Ekran görüntüleri `artifacts/nf-gorsel-qa/EKRAN-<ad>/` altına. Ekran oturumunun kendi portu kullanılır (CLAUDE.md §7). |
| `D-kod-davranis.md` | genel ajan (opus) | Akışları uçtan uca izler (web → API → DB). KARARLAR ve ILKELER'e uymayan davranışı, ikiz ve ölü kodu, ekrana çıkan ham hata metnini, sessizce düşen veriyi, saat dilimi ve yarış durumlarını arar; test boşluklarını listeler. Kanıtlanamayanlar ayrı listede. |

`OZET.md` (ekran oturumu yazar):
- dört raporun tek listesi, önem sırasıyla;
- Mert'e sorulacak kararlar (CLAUDE.md §13 şablonu);
- prototipten taşı / bırak listesi;
- daha sonra Mert'in seçimleri ve kapanış durumu.

**Bir ekran ne zaman bitmiş sayılır:**
- keşif bulguları kapandı ya da adıyla ertelendi;
- Mert'in "taşı" dediği prototip maddeleri gerçek uygulamada;
- ekranın açık backlog maddeleri kapandı ya da adıyla dışarıda (yukarıdaki 2. seçim);
- tam kapı yeşil, main CI yeşil;
- masaüstü ve telefon ekran görüntüsü alındı.

## Ekranlar ve durum
Durum değerleri: sırada / keşif / karar / uygulama / bitti.

| # | Ekran (uygulamadaki adı) | Kim | Prototip karşılaştırması | Durum |
|---|---|---|---|---|
| 1 | Schedule (+ Export, Templates) | owner, müdür | `research/PROTOTIP-SCHEDULE-2026-10-05.md` | karar — görev dosyası yazıldı (`tasks/EKRAN-01-SCHEDULE.md`, 2026-10-06), 6 açık soru |
| 2 | Requests (izin, takas, devir) | owner, müdür | proto-audit P1 | karar — keşif ve kararlar bitti (KK-158), görev dosyası yazıldı (`tasks/EKRAN-02-REQUESTS.md`, 2026-10-06), 2 açık soru |
| 3 | Employees (+ Archive, kişi çekmecesi) | owner, müdür | P2 | sırada |
| 4 | Availability | owner, müdür | P2 | sırada |
| 5 | Workspace (ana sayfa) | owner, müdür | P1 | sırada |
| 6 | Documents | owner, müdür | P2 | sırada |
| 7 | Announcements | herkes | P4 | sırada |
| 8 | Important Dates | owner, müdür | P4 | sırada |
| 9 | Notifications | herkes | P4 | sırada |
| 10 | Settings (General, Locations, Jobs, Notifications, Schedule rules, Conflict handling, Shift catalog, Roles & permissions, Documents, Acknowledgements, Support) | owner, admin | P3, PROTO-ESIT-SET | sırada |
| 11 | Employee view → Home | çalışan | P5, PHONE-EMP | sırada |
| 12 | Employee view → Schedule | çalışan | EMP-SCHED | sırada |
| 13 | Employee view → Shift Hub | çalışan | P5 | sırada |
| 14 | Employee view → My Availability | çalışan | P5 | sırada |
| 15 | Account (Profile, Security, Inbox, Preferences, Notifications, Workspaces, Documents) | herkes | P5 | sırada |
| 16 | Giriş ve katılım (Sign in, şifre sıfırlama, hesap kurtarma, davet kabulü, Workspaces, owner ve çalışan kurulumu) | herkes | Q1–Q4, PHONE-AUTH | sırada |
| 17 | Yasal sayfalar (Privacy, Terms, Accessibility, Contact, Your privacy choices) | herkes | Q5 | sırada |

**Sıranın gerekçesi:** önce müdür ve owner ekranları (ILKELER A, MVP önceliği), sonra çalışan, sonra hesap ve giriş.
- Prototip denetim dosyaları (P1–P5, Q1–Q5, PHONE-*, EMP-SCHED) repo dışında: `C:\Users\TheWe\Documents\Codex\newfork-prototype\proto-audit\`.
- Prototipe yazılmaz, yalnız kaynak olarak okunur (KK-156).

**Kapsam dışı:**
- Yalnız geliştirmede açılan deneme sayfaları (`/dev/*`).
- MVP sonrası konular (ROADMAP "Kapsam kararları").

## İlerleme kaydı
- 2026-10-05 ~19:50Z — Plan kabul edildi. Schedule keşfi başladı: dört alt ajan (backlog/prototip, güvenlik, görsel, kod/davranış). Raporlar gelince `docs/plan/ekranlar/01-schedule/`.
- 2026-10-05 ~20:00Z — Mert: "2. sayfa için yeni bir sessiona görev ata". Requests ayrı bir ekran oturumunda paralel başladı (ILKELER P17: ikinci işi Mert açar). Kurallar:
  - **Konuşma:** ekran oturumu keşfi bitirir, raporu koordinatöre yollar; Mert'e sorular koordinatörden gider.
  - **Sınır:** Schedule ile ortak dosyada iki oturum aynı anda yazmaz.
  - **Kayıt:** `BACKLOG.md`'yi ve bu dosyayı yalnız koordinatör yazar.
- 2026-10-06 ~01:45Z — İki ekranın görev dosyaları yazıldı ve main'e alındı (KK-160). Aynı turda Mert koordinatörü işçilikten çıkardı (KK-159): görev dosyalarını bundan sonra planlama oturumu yazar, uygulama ve main'e gönderim işi yapan oturumdadır.
