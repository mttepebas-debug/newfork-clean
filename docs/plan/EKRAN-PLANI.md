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
| 1 | Schedule (+ Export, Templates) | owner, müdür | `research/PROTOTIP-SCHEDULE-2026-10-05.md` | keşif (2026-10-05) |
| 2 | Requests (izin, takas, devir) | owner, müdür | proto-audit P1 | sırada |
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
