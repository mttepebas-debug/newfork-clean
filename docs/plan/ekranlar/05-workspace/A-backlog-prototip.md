# A — Workspace (ana sayfa): açık backlog ve prototip farkları (EKRAN-05, 2026-10-06, `a40f329b`)

## Özet
- **Ölçüm:** `origin/main` `a40f329b` üzerinde, 2026-10-06. Worktree HEAD aynı sha. Yerel DB'nin son migration'ı `20261007130000`; bu, main'deki son migration dosyasıyla aynı. DB'de yalnız SELECT çalıştı (salt okunur oturum). Test koşulmadı, dosya yazılmadı.
- **Son BL numarası:** BL-803 (`origin/main`'deki `BACKLOG.md`).
- **Sayılar:**
  - Ekranın içinde 7 açık backlog maddesi var: BL-564, BL-666, BL-667, BL-533, BL-410 ve numarasız U41. Yedincisi EKRAN-02'de "BL-410" adıyla bırakılan sayı sorunu; BL-410'un metni bu sorunu anlatmadığı için aşağıda YENİ olarak yazıldı. Altısı **geçerli**, hiçbiri bayat değil.
  - YENİ bulgu: 8 tane (1'i orta önemde).
  - Sınırda: 11 madde.
- **En ağır bulgular:**
  - **Duyuru kutusu (BL-564, orta):** Workspace'teki Announcements kutusu arşivli, süresi dolmuş ve yayımlanamamış duyuruyu hâlâ gösteriyor. KARARLAR K28 "yalnız yayındakiler" diyor. Canlı fonksiyon gövdesinde ölçüldü.
  - **"Today" sayıları UTC'ye göre (YENİ, orta):** "Scheduled today" ve "Open today" veritabanının UTC gününe göre sayıyor. Palo Alto'da müdür Ayşe Pazartesi 17:30'dan sonra Salı'nın sayılarını görür. KARARLAR "Bugün… hiçbiri UTC'yi kullanmaz" diyor.
- **Prototip (P1 W1–W46, PHONE-MGR K7/W1):**
  - 9 taşı, 4 bırak, 1 Mert sorusu.
  - P1'in "polished" dediği 7 düzeltmeden 6'sı main'de yok. Yalnız başlık açıklamasının üzerine gelince tam metni gösteren ipucu kodda var.
  - "Decision" dediği K28 de main'de yok.

## Ekranın sınırı
- **İçeride:**
  - Sol menü → Workspace (`/app/<workspace>/workspace`; `App.tsx:296-305`). Girebilenler owner, admin ve manager; izin `workspace.read`.
  - Sayfanın tek okuma ucu `get_workspace_dashboard_service`. Canlı gövdesi 88 satır.
  - Customize modu: kart sırası, gizleme, Save layout.
  - Setup checklist (yalnız owner ve admin görür).
  - Yedi kart: Today, Pending requests, Open shifts, Announcements, Todos, Notifications, Quick actions.
- **Sınırda:**
  - Settings → General'daki "Hide checklist / Show checklist" düğmesi (`GeneralSettingsPage.tsx:193-228`).
  - `/app` adresinin rol bazlı inişi (`AppHomeRedirect`, `App.tsx:593-596` → `resolveLanding.ts:60-75`).
  - Requests ekranının sayıları.
  - Employee view → Home (ekran 11). Çalışan `/app/employee-hub`'a iner; Workspace'e giremez (rota rolleri).
  - Giriş sonrası yönlendirme (BL-624, 625, 627).
- **Dışarıda:** Announcements, Notifications ve Schedule ekranlarının kendisi.

Teknik adlar, bir satırda:
- **Okuma ucu:** sayfanın veriyi çektiği tek veritabanı fonksiyonu.
- **UTC:** dünya saati; ABD'deki restoranın saati değil.
- **Ham hata:** kişiye gösterilen geliştirici cümlesi (ör. "Failed to fetch").

## 1. Açık backlog maddeleri (tazelik hükmüyle)

### İçeride

**Orta**

- **BL-564 (leave: medium / do: moderate) — Announcements kutusu arşivli, süresi dolmuş ve "Couldn't publish" duyuruyu da gösteriyor. Tazelik 2026-10-06 (`a40f329b`): geçerli.**
  - Kanıt (canlı gövde, satır 30): süzgeç yalnız `status in ('published','scheduled') and publish_at <= now()`. Arşiv (`archived_at`), süre (`expires_at`) ve yayın hatası (`release_failed_at`) hiç kontrol edilmiyor.
  - Yerel DB'de 15 duyuru var, hepsi canlı; bu yüzden hata yerelde görünmüyor.
  - Örnek: Zeynep (admin) "Inventory day"i arşivler; Kadıköy müdürü Ayşe onu ana sayfada görmeye devam eder.
  - Kural: KARARLAR K28. `nf-db` işi. Kural birebir olduğu için koordinatör karar verebilir.

- **BL-666 (leave: medium / do: safe) — Kartlarda yanlış ve eksik satırlar. Tazelik: geçerli; altı alt maddenin altısı da duruyor. Satır numaraları kaymış.**
  1. İleri tarihli iş "Due 1m ago" yazıyor. `relativeTime` farkı sıfırda kesiyor (`WorkspacePage.tsx:644-652`).
  2. Son tarihi olan belge işinde kişi ve belge adı kayboluyor, yalnız "Due …" kalıyor (`:556`).
  3. Duyuru satırında ham kategori kodu "general" yazıyor (`:424`). Announcements penceresi aynı kodu "General" diye yazıyor (`AnnouncementsPage.tsx:688`).
  4. Hiçbir yere gitmeyen satırlarda da sağ ok var (`:559`, `:580`).
  5. "View all notifications" her kelimeyi ayrı satıra kırıyor. Nedeni: `.workspace-feed > a` ızgara kuralı bağlantıya da uyuyor (`styles.css:13734-13745`, `WorkspacePage.tsx:440`).
  6. "New announcement" yalnız listeye gidiyor, yeni duyuru açmıyor (`:459-461`).
  - Örnek: Burak'ın Food Handler kartı 25 gün sonra bitiyor. Ayşe satırda yalnız "Due 1m ago" görür; kimin belgesi olduğu yazmaz.

- **BL-533 (leave: medium / do: moderate) — Notifications kutusu eski gelen kutusunu okuyor. Tazelik: geçerli.**
  - Kanıt: okuma ucu `get_notifications_service`'i çağırıyor (canlı gövde satır 31). Notifications sayfası ise `get_notification_inbox_v2_service`'i çağırıyor (`communication-service.ts:188`).
  - Aynı kişi için iki ayrı gelen kutusu var; CLAUDE.md §9 ikiz sisteme izin vermiyor.
  - Liste farkı ölçülmedi. v2'nin iki sürümü var; tek tanım okunamadı.

- **YENİ (leave: medium / do: moderate) — "Today" ve "Open shifts" sayıları UTC gününe göre. Tazelik: geçerli.**
  - Kanıt: canlı gövde satır 24-25 `shift.scheduled_date = current_date`; DB saat dilimi `UTC` (`show timezone`).
  - KARARLAR Schedule → "Bugün hangi saat dilimiyle" kuralı şöyle: lokasyon kendi saat dilimini kullanır, "hiçbiri UTC'yi kullanmaz".
  - Örnek: Palo Alto'da Ekim'de saat UTC-7. Müdür Ayşe Pazartesi 18:00'de ana sayfayı açar ve Salı'nın vardiya sayısını görür.
  - Akrabası: BL-238 (Schedule'ın haftası). Bu sayı ondan ayrı bir yerde hesaplanıyor.
  - `nf-db` işi, R2.

- **YENİ (leave: medium / do: moderate) — "Pending requests" kutusundaki "Shift changes" sayısı müdürün karar veremeyeceği vakaları da sayıyor.**
  - Kanıt: `WorkspacePage.tsx:110`, `awaiting_other_manager` aşamasındaki vakaları da sayıyor. Bu aşama "öteki lokasyonun müdürü bekleniyor" demek.
  - Aynı süzgeç Shift Hub'da da ayrıca yazılı (`ShiftExchangeHub.tsx:443`); kural iki yerde, ikiz.
  - Sayı, bütün takas listesi tarayıcıya çekilip orada hesaplanıyor (60 sn'de bir). Time off sayısı ise sunucuda.
  - EKRAN-02 görev dosyası (Out of scope 2) bunu "BL-410" adıyla Workspace turuna bıraktı. BL-410'un metni başka bir sorunu anlatıyor (izinsiz kutu), bu yüzden yeni numara öneriyorum.
  - Bağımlılık: EKRAN-02 A2'deki rütbe kuralı.
  - Örnek: Kadıköy ile Beşiktaş arasında bir takas Beşiktaş müdürünü bekliyor; Ayşe'nin sayısı yine 1 artar.

**Düşük**

- **BL-410 (leave: low / do: safe) — İzni olmayana sayı kutusu "0" gösteriyor. Tazelik: geçerli.**
  - Kanıt: kart döngüsünde `can()` yok (`WorkspacePage.tsx:184-229`); sayılar `:381-406`.
  - Ek (bugün): Quick actions'taki "View employees" ve "New announcement" bağlantıları da izne bakmıyor (`:456-461`).
  - Örnek: yalnız Availability'yi yöneten bir müdür "Time off 0" görür; aslında bekleyen talep var.
  - Karar gerekir (bölüm 4, soru 1).

- **BL-667 (leave: low / do: safe) — Altıncı açık iş görünmüyor. Tazelik: geçerli.**
  - Kanıt: canlı gövde satır 59 `limit 5`; ortak şema da en çok 5'e izin veriyor (`communications.ts:302`).
  - Yerel DB'de hiç iş kaydı yok (0 satır); kutu yerelde boş.
  - Karar gerekir (bölüm 4, soru 2).

- **U41 (leave: low / do: safe) — Customize, Add ve Customize modundaki Cancel `secondary` sınıfı taşıyor; hepsi yeşil. Tazelik: geçerli.**
  - Kanıt: `WorkspacePage.tsx:145`, `:165`, `:511`. CSS'te `.secondary` kuralı yok.
  - Cancel bir vazgeçme düğmesi; UI-09'a göre beyaz olmalı.
  - Akrabası: BL-659 (başka ekranlarda yeşil vazgeçme düğmeleri).

- **YENİ (leave: low / do: safe) — Setup checklist'teki "Billing" adımı faturalama olmayan bir sayfaya gidiyor.**
  - Kanıt: `WorkspacePage.tsx:273-278` → `/account/workspaces?checklist=billing`. `checklist=billing` parametresini hiçbir kod okumuyor (grep: yalnız `SchedulingSettingsPage.tsx:55` `setup` okuyor).
  - KARARLAR "MVP sınırı": "Stripe billing şimdilik yoktur". KARARLAR "Ürün kuralları": billing yalnız owner'ındır, ama listeyi admin de görüyor.
  - Örnek: Mert "Billing"e basar ve Workspaces listesine düşer; faturayla ilgili hiçbir şey yoktur.

- **YENİ (leave: low / do: safe) — "App tour" zorunlu adım ama tur yok.**
  - Kanıt: `:243-247`, `:354-361`. Düğme yalnız ziyareti işaretliyor.
  - "1 of 2 required visits" ilerlemesinin yarısı hiçbir şey göstermeyen bir tık.
  - Karar gerekir (soru 3).

- **YENİ (leave: low / do: safe) — Ham hata metni ekrana çıkıyor.**
  - Kanıt: sayfa okuması `:101-103` `query.error.message`; Save layout `:177` `saveMutation.error.message`.
  - Örnek: bağlantı koparsa Mert "Failed to fetch" görür.
  - Aile: BL-654, BL-395 (G11 kuralı). Bu iki yer o maddelerde yok.

- **YENİ (leave: low / do: safe) — Başlık iskeleti liste sayfalarından farklı.**
  - Masaüstü: Workspace başlığı en az 118 px ve açıklama iki satıra kırılıyor. Liste sayfaları sabit 142 px ve tek satır (`list-page.css:11-23`). Workspace'te `list-page` sınıfı yok.
  - Telefon: başlık 32 px (`styles.css:1369`); liste sayfaları 28 px (KARARLAR Genel).
  - Örnek: Ayşe menüden Workspace → Announcements geçerken başlık ve içerik yukarı aşağı kayar.

- **YENİ (leave: low / do: safe) — Ölü alan ve ölü kural.**
  - `unread_notification_count` hesaplanıyor (canlı gövde 28, şema `communications.ts:297`) ama ekranda okunmuyor.
  - "Manager" yedek adı (gövde 22) hiç devreye girmiyor: `display_name` NOT NULL, 2412 kayıtta boş ad 0.
  - `.workspace-page { min-width: 900px }` (`styles.css:3431-3434`) ve telefondaki `min-width: 760px` (`:12526`) kuralları, sonraki `min-width: 0` (`:13437`) yüzünden hiç uygulanmıyor.

- **YENİ, B raporu doğrulasın (leave: low / do: moderate) — Setup checklist'in kapısı iki kaynaktan karar veriyor.**
  - Web rol adına bakıyor (`WorkspacePage.tsx:180-181`).
  - Servisler eski yardımcıya soruyor (`service_actor_has_permission(..., 'settings.general.read')`) ve `authz.*` ipucu olmadan 42501 dönüyor ("workspace management required"; canlı gövde satır 10-15).
  - CLAUDE.md §9'a göre yetki kararı çekirdekten (`authorize`) gelmeli.

### Sınırda (bu ekranın işi değil, adıyla)

| Madde | Ne | Tazelik |
|---|---|---|
| BL-176 (medium / moderate) | Workspace rotası da `PermissionRoute`'tan geçiyor; o kapı `permissions.includes` kullanıyor (`PermissionRoute.tsx:38`, `:56`) | geçerli (bugün okundu) |
| BL-624 (high / moderate) | Girişte bekleyen davet ekranı yok; kişi doğrudan Workspace'e iniyor | geçerli (2026-10-06 tazeliği; `resolveLanding.ts` bugün okundu) |
| BL-625 (medium / moderate) | Varsayılan yoksa en son kullanılan workspace'e iniyor (`mostRecentlyUsed`) | geçerli |
| BL-627 (medium / safe) | Paylaşılan cihazda önceki kişinin sayfasına iniyor (`SignInPage.tsx:23`) | geçerli |
| BL-348 (low / safe) | Ad onayı bildirimi `/app`'e gidiyor, yani Workspace'e düşüyor | ölçülmedi (2026-09-29 geçerli) |
| BL-553 (low / safe) | Menü görünürlüğü izin anahtarına bakıyor | ölçülmedi |
| BL-079 (medium / risky) | Selamlamadaki ad `user_profiles.display_name`'den geliyor; ad için tek kaynak yok | geçerli (2026-10-06 tazeliği) |
| BL-659 (low / safe) | Başka ekranlardaki yeşil vazgeçme düğmeleri; U41 ile aynı aile | ölçülmedi |
| BL-238 (high / risky) | Schedule'ın UTC haftası; YENİ "Today UTC" bulgusunun akrabası | geçerli (2026-10-06) |
| Settings → General checklist düğmesi | Workspace'teki kartla uyumlu (aynı sorgu anahtarı) | sorun yok |
| Employee view → Home (ekran 11) | Çalışan buraya giremez; kendi ana sayfasına iner | sorun yok |

## 2. KARARLAR'da olup kodda olmayan kurallar

| # | Kural | Kodda | Önem | BL | İşaret |
|---|---|---|---|---|---|
| K1 | K28: kutuda yalnız yayındaki duyurular | arşivli, süresi dolmuş ve "Couldn't publish" duyurular da çıkıyor | orta | BL-564 | medium / moderate |
| K2 | Schedule → "Bugün": lokasyonun saat dilimi, UTC asla | "Today" sayıları UTC gününe göre | orta | YENİ | medium / moderate |
| K3 | UI-09: vazgeçme düğmesi beyaz | Customize modundaki Cancel yeşil | düşük | U41 | low / safe |
| K4 | MVP sınırı: Stripe billing yok; billing owner'a özel | checklist'te "Billing" adımı var, admin de görüyor | düşük | YENİ | low / safe |
| K5 | Genel: kullanıcı metni sistem mesajı gibi yazılmaz (G11) | iki yerde ham hata | düşük | YENİ (BL-654 ailesi) | low / safe |
| K6 | Genel: sayfa iskeleti piksel eşitliği (142 + tek satır; telefonda 28) | Workspace bu iskelete katılmamış | düşük | YENİ | low / safe |
| K7 | CLAUDE.md §9: ikiz sistem yok | iki gelen kutusu; shift change süzgeci iki yerde | orta / düşük | BL-533, YENİ | yukarıda |

Bugün kodda okunup kurala uyduğu görülenler:
- Telefonda Schedule'a götüren bağlantılar gizli: Open Schedule (`:412`, `:451-455`) ve checklist'teki "First schedule view" (`:330`). Kural: KARARLAR "Schedule telefonda tamamen kapalı" (768 px).
- API reddederse sayfa ham hata yerine tek "erişim yok" kartını gösteriyor (`:89-95`).
- Takas kontrol edilemezse sayı "0" değil "—" (`:110`, BL-278).

## 3. Prototip farkları (P1 W1–W46, PHONE-MGR)

P1'in "matched" dediği maddeler bugünkü kodda yeniden okundu ve tuttu:
- W3 (`:83-86`), W8 (`:146-149`), W10 (`:199`, `:207`), W11 (`:185-189`), W12 (`styles.css:13632-13653`), W15 (`:302`), W16 (`:319-320`), W18, W22 (`:66-72`, `:110`), W24, W27 (`:420`), W28, W30 (kırpma ortak şemada, `communications.ts:281`), W35 (`:583-600`), W36, W39–W41.

Not: W22 sayıları "matched", ama YENİ shift change bulgusu sayının kendisinin yanlış olduğunu söylüyor.

| Kimlik | Fark (prototip → gerçek) | Öneri | Dayanak |
|---|---|---|---|
| W2 | Açıklama tek satır + ipucu; gerçekte ipucu var (`CatalogPageHeader.tsx:27`) ama metin iki satıra kırılıyor | **taşı** (K6 ile) | Mert'in piksel eşitliği talimatı (KARARLAR Genel); prototip Workspace'i de "page-shell v1"e koydu |
| W6 | Cancel beyaz | **taşı** | UI-09 (U41) |
| W25 | Kutuda yalnız canlı duyurular | **taşı** | KARARLAR K28 (BL-564) |
| W26 | Kategori "General" | **taşı** | BL-666 (3) |
| W33 | "Due in 25d" | **taşı** | BL-666 (1) |
| W43 | Ok yalnız açılan satırda | **taşı** | BL-666 (4) |
| W44 | "Diana Mirasova - Alcohol Server Permit · Due 5d ago" | **taşı** | BL-666 (2); ILKELER P09 |
| W45 | "View all notifications" tek satır | **taşı** | BL-666 (5) |
| W37 | Bağlantının üzerine gelince alt çizgi | **taşı**, öteki ekranlardaki metin bağlantılarıyla aynı davranış ölçülerek (C raporu) | ILKELER P04 koşulu: tutarlılık ayarı yazıyla verilebilir |
| W31 | 6. iş görünmüyor (prototip de gizliyor, kusur diye not etti) | **Mert sorusu** | BL-667 (soru 2) |
| W4 | Tarih prototipin "bugünü"ne sabit | **bırak** | prototip yapıntısı |
| W7 | 400 ms'lik "Saving…" | **bırak** | gerçekte gerçek kayıt süresi var |
| W46 | Kartlar sahip sayfanın verisini okuyor | **bırak** (prototipin iç yapısı); gerçek uygulamadaki karşılığı BL-533 | CLAUDE.md §9 ikiz yok |
| PHONE K7 | Telefonda başlık 38 | **bırak** | KARARLAR Genel "telefonda başlık 28" (K6) |

PHONE W1 (tek sütun, alt alta kartlar) gerçek uygulamayla aynı (`styles.css:14008-14040`).

## 4. Mert'e sorular (taslak, §13 şablonu)

1. **İzni olmayan bir müdür sayı kutusunu nasıl görsün?**
   - Bugün: sol menü → Workspace → "Pending requests". Yalnız Availability'yi yöneten Can, gerçekte bekleyen talep varken "Time off 0" görür.
   - (Önerilen) Kutu gizlensin; Customize'da da çıkmasın. Can yalnız işini gördüğü kutuları görür; yanlış sıfır yok. Dayanak: ILKELER P11 (doğru veri tahminden önce gelir) + A anti-hedefler (gürültü yok).
   - Kutu dursun, sayının yerine "—" ve "No access" yazsın.
   - Bugünkü gibi 0 kalsın.
2. **Beşten fazla açık iş olunca Todos kutusu ne yapsın?**
   - Bugün: yedi belgenin süresi dolarken Ayşe beşini görür. Belge işlerini buradan kapatamaz; altıncı ve yedinci belge düzelene kadar hiç görünmez.
   - (Önerilen) Sınır kalksın; kutu kendi içinde kaydırılsın. Dayanak: ILKELER P09 (veri sessizce düşmez) + P02 (tam çözüm). Eski taslak "+N more" öneriyordu. Ancak işlerin ayrı bir sayfası yok, bu yüzden "+N more" kişiyi o işlere götüremez.
   - Beşin altında tıklanamayan "+2 more" yazısı.
   - Bugünkü gibi kalsın.
3. **Setup checklist'teki "App tour" ve "Billing" adımları ne olsun?**
   - Bugün: Mert "App tour"a basar, yalnız işaret konur; tur yoktur. "Billing"e basar, Workspaces listesine düşer; faturalama yoktur. Admin de "Billing"i görür.
   - (Önerilen) İkisi de şimdilik kalksın; zorunlu adım yalnız "Set scheduling preferences" olsun ("0 of 1"). Billing, faturalama işi (ROADMAP satır 10) gelince geri gelir. Dayanak: KARARLAR MVP sınırı "Stripe billing şimdilik yoktur" + ILKELER A (oyuncak görünüm yok). App tour için: yok — yeni karar.
   - Kalsınlar, yanlarında "Coming soon" yazsın.
   - Bugünkü gibi kalsın.

## 5. Koordinatörün verebileceği kararlar (kural birebir kapsıyor)

1. **BL-564:** kutu yalnız canlı duyuruları gösterir (arşiv, süre ve yayın hatası süzülür). Dayanak: KARARLAR K28. `nf-db`, R2.
2. **"Today" sayıları:** her lokasyon kendi saat diliminin bugününü sayar. Dayanak: KARARLAR Schedule → "Bugün hangi saat dilimiyle". `nf-db`, R2.
3. **U41:**
   - Cancel beyaz vazgeçme düğmesi olur (UI-09).
   - Customize ve Add yeşil aksiyon olarak kalır; işe yaramayan `secondary` sınıfı silinir.
4. **BL-666 (1)–(5):** salt hata düzeltmesi.
5. **BL-666 (6):** "New announcement" yeni duyuru penceresini açar. Dayanak: düğmenin kendi adı + ILKELER P02. Bunun için Announcements'ın adresle "yeni" açılabilmesi gerekir.
6. **BL-533:** Workspace'teki Notifications kutusu Notifications sayfasıyla aynı okumayı kullanır; eski fonksiyon silinir ve emekli nesneler listesine (`retired_objects_stay_gone`) eklenir. Dayanak: CLAUDE.md §9 ikiz yok.
7. **Shift change sayısı:** EKRAN-02 A2'nin rütbe kuralını izler; süzgeç tek yerde tutulur, tercihen sunucuda. Dayanak: EKRAN-02 Out of scope 2 (koordinatörün yazılı kararı) + ILKELER P07.
8. **Ham hata metni:** sade cümleye döner (G11).
9. **Başlık iskeleti:** Workspace de 142 px sabit başlık bloğu ve tek satır açıklama kullanır; telefonda 28 px. Dayanak: KARARLAR Genel piksel eşitliği ve telefon 28. Kural liste sayfalarını adıyla sayıyor; Workspace'e genişletme koordinatörün tutarlılık kararıdır (ILKELER P04 koşulu).
10. **Ölü alan ve CSS silinir.** Dayanak: CLAUDE.md "eski veri korunmaz".

Gözlem, karar istemiyor: "Open shifts" kutusu "Today"deki "Open today" ile aynı sayıyı tekrar gösteriyor (`:389`, `:410`). Prototip de böyle. Mert gezerken söylerse sorulur.

Test boşluğu (D raporu için): Customize / Save layout, Todos ve Setup checklist için e2e yok. Tek e2e `scope-and-employee-view.spec.ts:185-213` yalnız adresi doğruluyor. Vitest 12 senaryo.

## 6. Kanıtta kullanılan komutlar
- `git fetch` → `origin/main` = HEAD = `a40f329b`. `WorkspacePage.tsx`'in son kod değişikliği `bdd1be43` (TEL-KAPALI-2).
- Canlı gövde: `pg_get_functiondef('public.get_workspace_dashboard_service')` (88 satır); `get_announcements_service` (`display_status` satır 39-41); `get_owner_setup_checklist_progress_service` (satır 10-15); `get_notifications_service` (satır 9-15).
- SELECT'ler:
  - `show timezone` → UTC.
  - Duyurular 15 satır, hepsi `published`, arşivsiz, süresi dolmamış.
  - `workspace_todos` 0 satır; `workspace_layout_preferences` 0 satır.
  - `user_profiles`: 2412 satır, boş ad 0, alan NOT NULL.
- grep:
  - `checklist=billing` okuyan kod yok.
  - `.secondary` CSS kuralı yok.
  - `awaiting_other_manager` iki yerde (`WorkspacePage.tsx:110`, `ShiftExchangeHub.tsx:443`).
  - `unread_notification_count` ekranda okunmuyor.
- Prototip (yalnız okundu, yazılmadı): `newfork-prototype/KANONIK.md`, `proto-audit/P1.md:25-75` ve `:172-187`, `proto-audit/PHONE-MGR.md:27-28`.
- Backlog: açık bölüm satır 1–1867 (`## Kapanan maddeler` 1868'de başlıyor); en yüksek numara BL-803. U41'in takma adı `tasks/BACKLOG-PROGRAM.md:536`'dan.

Yazılan dosya yok. Rapor bu mesajdır. Ölçülen `origin/main`: **`a40f329b3728f1823378d8d42807689cfe43e4fb`**.
