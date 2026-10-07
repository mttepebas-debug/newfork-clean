- **Karar:** yok. Bu bir inceleme; kod, migration ve test dosyası değişmedi.
- **İzin:** yok. Yalnız `.md` dosyası `task/ekran-10` dalında.
- **Risk:** 🔴 BL-178 bugün de açık. `settings.general.manage` verilmiş özel müdür rolü workspace adını, logoyu ve kurulum listesini yazabiliyor. Roles ekranı bu izni müdüre sunuyor.
- **Soru:** 5 soru (§8): altı tasarımdan hangisi; tek Save davranışı; dört öneriden hangileri (Ö1–Ö4); Ö1 seçilirse workspace saat dilimi modeli (önce sohbette); kurulum listesini admin'in görmesi (EKRAN-05 S3).
- **Sonraki:** DURDURULABILIR, sabah Mert'in seçimi (tasarım + öneriler Ö1–Ö4). Sonra EKRAN-10 `EKRAN.md` kabul listesi açılır. BL-178 / BL-232 GUVENLIK-A paketinde kalır.

# EKRAN-10 · Settings → General: inceleme, altı tasarım ve dört öneri

## Mert için özet

Tasarımlar: **https://claude.ai/artifact/Kwz63F5JeddW5S7y2kSsAi** (v2). Altı varyant var, masaüstü ve telefon, bugünkü sayfayla yan yana. 2026-10-07 isteğin üzerine General'a eklenebilecek dört özellik de (Ö1–Ö4) aynı sayfada; düğmeyle açılıp kapanıyor.

1. 🔴 **Müdüre verilen özel rol workspace'in adını ve logosunu değiştirebiliyor (BL-178).** Örnek: Mehmet'e "Shift lead" rolü verilip içine "General" izni konunca Mehmet "Bosphorus Kitchen" adını değiştirebiliyor. 2026-09-26 kararın "yalnız owner ve admin" idi; Roles ekranı bu seçeneği hâlâ sunuyor.
2. 🟠 **Logo değiştirilince eski logo dosyası silinmiyor.** Eski dosya herkese açık adresinde kalıyor. Örnek: Bosphorus Kitchen logosunu yeniler; eski logonun adresini bilen biri onu açmaya devam eder.
3. 🟠 **Kayıt reddedilince ekran yine "saved" diyor.** Örnek: rolü az önce düşürülen bir admin adı değiştirip Save'e basar. Ad değişmez ama ekranda "Organization settings saved." yazar.
4. 🟠 **Sayfada dört ayrı kaydetme yeri var.** "Hide checklist" ile tercih edilen ad düğmesi basınca hemen kaydediyor, logo kendi penceresinde kaydediliyor, ad ise "Save changes" ile. Kural pencerede tek Save, sağ altta (P20).
5. 🟠 **Türkçe harf hiçbir katmanda reddedilmiyor.** Örnek: "Boğaziçi Mutfağı" adı kaydediliyor. Kural metin alanında ğ, ş, ı, İ yasak (P12, BL-503).

Ayrıca telefonda "Manage logo" düğmesi kartın sağından taşıyor (BL-588). General'dan Documents'a geçerken başlık 50 px kayıyor. Dört yeşil düğmenin dördü de farklı genişlikte.

---

## 1. Kapsam, yöntem, tarih

- **Ekran:** Settings → General (`/app/settings/general`), owner ve admin sayfası.
  - Sayfada dört şey var: Schedule logo ("Manage logo" penceresi), Organization name ("Save changes"), Setup checklist ("Hide / Show checklist"), Preferred names ("Answer them here / Let them through").
  - **Saat dilimi alanı yok.** Workspace düzeyinde saat dilimi hiç yok; her lokasyonun kendi saat dilimi var (§5 G-15).
- **Sınırda:**
  - Logo penceresi Schedule ile ortak (`ScheduleLogoUploadDialog`).
  - Setup checklist'in ana sayfa kartı EKRAN-05'te.
  - Roles ekranının izin listesi Settings → Roles'ta.
- **Ölçüm:**
  - `origin/main` `5b0dbca1` (2026-10-07). Mert'in dev sunucusu web 5555 / API 5556 aynı commit'te açıktı, onu kullandım.
  - 5632/5633'te EKRAN-16 oturumunun sunucusu vardı, dokunmadım.
  - Yerel DB, Playwright (Chrome), 1440 × 900 ve 390 × 844 (dokunmatik).
- **Kişiler:**
  - Owner: seed `owner@newfork.test` (Meyhouse).
  - Admin Zeynep, müdür Ayşe, müdür Mehmet, çalışan Emre: e2e dünyası `World e2e1790265977849` (`e2e/.world.json`).
  - Özel müdür: Mehmet'e geçici "Shift lead EKRAN10" rolü (§3.3).
- **Alt ajan:** kod ve veritabanı izi ile test koşusu, salt okur, Opus. Raporu olduğu gibi Ek A'da.
- **Mert'in görev ortasındaki mesajı (2026-10-07 ~09:00Z, bu oturumun penceresinde):** "general sayfasına eklenebilecek özellikleri de düşünerek geliştirme yap ve artifactları güncelle."
  - Bunu tasarım geliştirmesi olarak okudum: önerileri tasarım sayfasına ekledim (§7.1), uygulama koduna dokunmadım. Görev "kod değiştirme" diyordu; kod işi tasarım seçilip `EKRAN.md` onaylanınca başlar.
  - Bu okumayı koordinatöre de bildiriyorum.
- **Ekran görüntüleri:** `newfork-clean/artifacts/EKRAN-10-GENERAL/` (gitignore'da). Dosya adları §9'da.

## 2. Rol matrisi: kim görür, kim neyi değiştirir

| Kişi | Sayfayı görür mü | Ekran ne gösteriyor | Ad | Logo | Checklist | Preferred name |
|---|---|---|---|---|---|---|
| Owner (Meyhouse) | Evet | Dört denetim açık | ✔ | ✔ | ✔ | ✔ |
| Admin (Zeynep) | Evet | Dört denetim açık | ✔ | ✔ | ✔ (katalog "yalnız owner" diyor, BL-808) | ✔ |
| Yerleşik Manager (Ayşe) | Hayır. Adres sessizce Workspace'e atıyor, erişim-yok kartı yok | — | RLS 0 satır, hata yok | 42501 | 42501, ipucu yok | `authz.missing_permission` |
| Özel müdür + `settings.general.manage` (Mehmet, geçici rol) | Evet. Settings menüsünde yalnız General ve Support var | Dört denetim açık. Adı değiştirince "Organization settings saved." çıkıyor ve sol menüde yeni ad görünüyor | **✔ yazıyor** | **✔ yazıyor** | **✔ yazıyor** | `authz.out_of_scope` (çekirdek "hayır") |
| Çalışan (Emre) | Hayır. Adres sessizce Employee Hub'a atıyor | — | 0 satır | 42501 | 42501 | `authz.missing_permission` |

- Sunucu sütunlarının kaynağı alt ajanın geri alınan denemesi (Ek A §2). Özel müdür satırını ekranda da denedim (§3.3).
- Aynı kişiye aynı sayfadaki dört yazmadan üçü "evet", biri "hayır" diyor. Ad, logo ve checklist eski kapıdan (`service_actor_has_permission`) geçiyor, preferred name çekirdekten (`app_private.authorize`).

## 3. Gerçek uygulamada denemeler

### 3.1 Okuma ve alanlar (owner, hiçbir şey kaydedilmeden)

| Deneme | Sonuç | Beklenen (kayıt) |
|---|---|---|
| Adı yalnız boşluk yap | Save kapalı ✔ | KARARLAR "Form ve girdi kuralları": boş olmaz |
| Ada "Boğaziçi Mutfağı İstanbul" yaz | Save açık, uyarı yok ✗ | Türkçe harf yasak (P12) |
| 130 karakter yapıştır | 120'de kesiliyor; sunucu da 120 diyor ✔ | — |
| Adı değiştirip Locations'a geç | Soru yok, değişiklik bırakılıyor ✔ | P26: kayıp küçükse sorulmaz |
| Logo penceresinde Esc | Kapanmıyor ✗ | BL-711; prototip notu E4 |
| Klavyeyle Tab | Sıra mantıklı (Manage logo → ad → Save → Hide checklist → Preferred). Düğmelerde 2 px yeşil halka var; ad alanında tarayıcının varsayılan halkası ✔ | §2.A.8 görünür odak |

### 3.2 Kaydetme denemeleri (admin Zeynep, test dünyası; her değişiklik geri alındı)

Yöntem: Playwright, `World e2e1790265977849` (`ed44c7ab…`), `db.lock` bende (2026-10-07 ~08:50Z). Başlangıç durumu yazıldı: ad "World e2e1790265977849", logo yok, ölçek 1.00. Bitişte aynı durum doğrulandı (SELECT).

| Deneme | Ekran | Sunucu | Sonuç |
|---|---|---|---|
| Adı "Boğaziçi Mutfağı" yap, Save changes | "Organization settings saved."; sol menü "Boğaziçi Mutfağı" | `PATCH /rest/v1/workspaces` 204, `content-range 0-0/*` (1 satır) | ✗ Türkçe harf kaydedildi (P12, BL-503). Geri alındı |
| "Hide checklist" | Düğme bir anlığına bekliyor, sonra "Show checklist" | `PATCH …/setup-checklist` 200, satırda `user_id` = Zeynep | Kayıt kişi başına; ekran "for this workspace" diyor (BL-811). Save'siz anında kayıt (P20). Geri alındı |
| "Answer them here" | Düğme "Let them through" oldu | `PUT …/preferred-name-approval` 204 | Save'siz anında kayıt (P20). Geri alındı |

Görüntü: `admin-1440-turkish-saved.png`, `admin-1440-after-toggles.png`.

### 3.3 Özel müdür rolü (BL-178), ekranda

Yöntem: admin Zeynep'in oturumuyla API'den yeni rol açıldı: `POST /v1/workspaces/ed44…/roles` → **201**. Rol "Shift lead EKRAN10", sınıfı manager, Manager'ın izinleri + `settings.general.read` + `settings.general.manage`. Sunucu bu izni müdür rolüne vermeyi kabul etti; BL-178 kararı "verilemez" diyor. Mehmet'in üyeliği bu role bağlandı (yerel SQL, fixture). Mehmet'in çalışan kaydı yok, bu yüzden çekmeceden atanamadı. Her şey geri alındı: üyelik yeniden Manager (`ec0794e0…`), rol API'den silindi (`DELETE` 204, kalan 0).

| Mehmet ("Shift lead") ne yaptı | Ekran | Sunucu |
|---|---|---|
| `/app/settings/general`'ı açtı | Sayfa açıldı; Settings menüsünde yalnız General ve Support | — |
| Adı "Renamed by Shift lead" yaptı, Save changes | "Organization settings saved."; sol menüde yeni ad | `PATCH` 204, 1 satır ✔ **(yazmamalıydı)** |
| "Hide checklist" | "Show checklist" | 200 ✔ (kendi satırı) |
| "Answer them here" | "That setting could not be saved." | 403 `authz.out_of_scope` (çekirdek "hayır") |

Görüntü: `custom-manager-1440-general.png`, `custom-manager-1440-after-save.png`, `custom-manager-1440-toggles.png`. Logo yazmasını ekranda denemedim; alt ajanın geri alınan denemesinde ✔ (Ek A §2).

### 3.4 Eski izinle kaydetme ("sessiz başarı")

Durum: yetkisi olmayan biri sayfayı açık tutuyor. Örneğin rolü az önce düşürülmüş bir admin ya da askıya alınmış bir workspace. Bunu yerleşik Manager Ayşe ile taklit ettim: tarayıcıya gelen `/v1/context` cevabına `settings.general.read/manage` eklendi (`page.route`). Yazma ise gerçek veritabanı kuralına gitti.

| Deneme | Ekran | Sunucu | Sonuç |
|---|---|---|---|
| Adı "Renamed by a manager" yap, Save changes | **"Organization settings saved."** | `PATCH` 204, `content-range */*` (**0 satır**) | ✗ Ad değişmedi (SELECT: "World e2e1790265977849"), ama ekran "saved" diyor (P09) |
| "Hide checklist" | "Setup checklist visibility could not be saved." (sayfa açılırken de aynı yazı: okuma hatasını "kaydedilemedi" diye yazıyor) | 403 "Workspace management required" (ipucusuz) | Ret doğru, metin yanlış |
| Preferred name | "That setting could not be saved." | 403 `authz.missing_permission` | ✔ |

Görüntü: `manager-1440-stale-permission-save.png` (sol menüde eski ad, üstte "saved"), `manager-1440-stale-permission-toggles.png`.

### 3.5 Logo dosyaları (admin Zeynep, test dünyası)

İki küçük PNG yükledim, sonra "Remove" ile logoyu kaldırdım. Her adımdan sonra kovadaki nesneleri SQL ile saydım.

| Adım | `workspaces.logo_storage_path` | Kovadaki dosyalar (`ed44…/`) |
|---|---|---|
| Başta | yok | 0 |
| 1. logo (logo-a.png) | `…/8558f98a….png` | 1 |
| 2. logo (logo-b.png), değiştir | `…/7c651315….png` | **2** (eski dosya kaldı) |
| Remove + Save | yok | **2** (ikisi de kaldı) |

- Eski iki dosya **girişsiz, herkese açık adresten açılıyor:** `GET /storage/v1/object/public/workspace-logos/…` → 200 `image/png`.
- Tarayıcı silmeyi denedi (`DELETE /storage/v1/object/workspace-logos` 200), ama hiçbir şey silinmedi. Neden: kovada SELECT politikası yok, depolamanın silme sorgusu 0 satır buluyor (Ek A §3).
- Temizlik: SQL'le silme depolamanın koruması yüzünden reddedildi ("Direct deletion from storage tables is not allowed"). İki test dosyası yerel depolama API'sinden, yerel servis anahtarıyla silindi; kalan 0.

Görüntü: `admin-1440-logo-replaced.png`.

## 4. UI / UX ölçümleri (owner, Meyhouse)

**Masaüstü 1440.** Konumlar sol üst köşeden px; içerik alanı x=544–1378.

| Öğe | Ölçü | Sorun |
|---|---|---|
| Başlık | Simge 42 × 42 + "General" 28 px / 800, y=30 | Settings → Documents'ta "SETTINGS" üst yazısı + 38 px / 650 + yeşil nokta, başlık y=80. Geçişte başlık 50 px kayıyor (KARARLAR "Sayfa iskeleti, piksel eşitliği") |
| Kartlar | 3 kart: 834 × 341, 834 × 112, 834 × 148; aralar 18 / 18 | Satır yükseklikleri 152 / 110 / 110 / 146; etiketler üste, denetimler dikey ortaya hizalı (iki ayrı çizgi) |
| Sol sütun | Etiket x=569, açıklama 300 px | ✔ aynı çizgi |
| Sağ sütun başlangıcı | x=903, dört satırda da | ✔ |
| Düğme genişlikleri | Manage logo 156, Save changes 165, Hide checklist 167, Answer them here 199 | Dördü de yeşil, dördü farklı genişlikte |
| Düğme sağ kenarları | 1333 / 1353 / 1353 / 1353 | "Manage logo" 20 px içeride: logo satırının ızgarası sağa uzanmıyor (`styles.css:12007-12011`, `minmax(180px,260px) max-content`) |
| Düğme boyu | 42 px, 16 px / 750 | Liste sayfalarında ekleme düğmesi 36 px / 13 px / 600, logo penceresinde 34 px / 13 px. Aynı işlev için üç boy var (§2.A.7) |
| Ad alanı | 450 × 42, çerçeve `--theme-muted` | Liste sayfası girdileri 36 px, çerçeve `--theme-border-control` |
| Kontrast | Açıklama `#66716c` beyazda 5.07:1; durum yazısı `#59645f` 6.15:1; yeşil düğme 6.59:1 | ✔ AA |
| Ham renk | `styles.css:11973` `#d9dfdc`, `:12036` `#59645f` | §2.A.7: token kullanılmalı |

**Telefon 390.**
- Sayfa yana kaymıyor (scrollWidth 390).
- **"Manage logo" kartın sağından taşıyor:** düğme x=235, genişlik 156, sağ kenar 391; kartın iç kenarı ~373 (BL-588). Kök neden yine `styles.css:12007-12011`: logo kutusu en az 180 px + 14 px boşluk + 156 px düğme, kartın içine sığmıyor.
- Settings alt menüsü yatay sekmeye dönüşüyor; "Notifications" kesik ("Notifi").
- Logo penceresi telefonda sığıyor. Arka plan karartılmıyor (prototip G3).

**Buton dili ve metin.**
- Aç/kapa düğmeleri ("Hide checklist", "Answer them here") yeşil, ama yeşil asıl eylem içindir.
- Logo penceresinin Save'i koyu yeşil (`#173e34`, pasif görünüm, BL-615). Pencerede vazgeç düğmesi yok, yalnız ✕ var.
- Metinlerde "Organization identity…", "Organization name", "organization ID", menüde "ORGANIZATION" (BL-851).
- "Answer them here / Let them through" ne yaptığını söylemiyor. "This is not the onboarding approval setting." geliştirici notu gibi. KARARLAR'daki adlar "Auto approve / Manager approval".
- Sayfa "Schedule logo" diyor, pencere "Workspace logo".

## 5. Bulgular (önem sırasıyla)

| # | Önem | Ne beklenir (kayıt) | Ne oluyor, örnek | Kök neden (web → API → DB) | Backlog | İşaret önerisi |
|---|---|---|---|---|---|---|
| G-01 | 🔴 yüksek | Organizasyon ayarı yalnız owner ve admin'de; ekran bu seçeneği sunmaz (BL-178 kararı, 2026-09-26) | Özel müdür rolü adı, logoyu ve checklist'i yazıyor; preferred name'de çekirdek "hayır" diyor. Roles ekranı "General → Edit"i müdür rolüne sunuyor. Örnek: Mehmet ("Shift lead") Bosphorus Kitchen'ın adını değiştirir | Web `GeneralSettingsPage.tsx:31-32` (`permissions.includes`) → API yok (tarayıcı doğrudan) → RLS `workspaces_update_manager` → eski kapı (`schema.sql:33646`); izin `custom_grantable = t`; Roles listesi `role-permissions.ts:143-159` `adminOnly` değil; pgTAP `roles_permissions_rls.test.sql:133-139` yanlış davranışı kilitliyor, matris `authorization_matrix.test.sql:819-822` tersini diyor | BL-178 (+ BL-232, BL-276); GUVENLIK-A | leave: high / do: risky (değişmedi) |
| G-02 | 🟠 orta | Logo değişince eski dosya gider (gizlilik; P09) | Eski logo ve "Remove" sonrası dosya herkese açık kovada kalıyor. Ekranda ölçüldü: iki logo yükleyip kaldırınca kovada 2 dosya kaldı, ikisi de girişsiz açılıyor (§3.5) | `organization-data.ts:106-108`, `:151-153` `remove()` hatası okunmuyor; kovada SELECT politikası yok → depolama silmesi 0 satır | YENİ (BL-360'tan ayrı) | leave: medium / do: safe |
| G-03 | 🟠 orta | Yükleme yarıda kalırsa dosya temizlenir | Dosya yüklenir, satır güncellemesi düşerse dosya sahipsiz kalır | `organization-data.ts:131-149` | YENİ | leave: low / do: safe |
| G-04 | 🟠 orta | Veri sessizce düşmez (P09) | Yazma reddedilince ekran "Organization settings saved." diyor. Ekranda ölçüldü: 0 satır, ad değişmedi, ekran "saved" (§3.4) | `organization-data.ts:237-241` değişen satır sayısına bakmıyor; RLS 0 satırda PostgREST 204 | YENİ | leave: medium / do: safe |
| G-05 | 🟠 orta | Pencerede tek Save, sağ altta (P20; KARARLAR Genel → "Kaydetme") | Dört kaydetme yeri: logo penceresi Save, ad "Save changes", "Hide checklist" ve preferred name düğmesi basınca kaydediyor | `GeneralSettingsPage.tsx:136-143`, `:179-190`, `:211-222`, `:250-267` | YENİ (BL-047 "polish" kapsamı tanımsızdı) | leave: medium / do: moderate |
| G-06 | 🟠 orta | Metin alanında ğ ş ı İ yasak (P12) | "Boğaziçi Mutfağı" kaydediliyor; web, shared ve DB'de kural yok. Ekranda ölçüldü: admin "Boğaziçi Mutfağı"nı kaydetti, sol menüde göründü (§3.2) | Web `:154-161`; shared `index.ts:184`; DB CHECK yalnız uzunluk (`schema.sql:29548`) | BL-503 | leave: high / do: risky (değişmedi) |
| G-07 | 🟠 orta | Checklist kuralı çekirdekte, tek yerde | Admin gizleyebiliyor, katalog "yalnız owner" diyor. Gizleme kişi başına ama ekran "for this workspace" yazıyor | Rota `communication-routes.ts:352-389` eski kapı; servis ipucusuz 42501; tablo anahtarı `(workspace_id, user_id)` | BL-808, BL-811, BL-898 | değişmedi |
| G-08 | 🟠 orta | Kapalı ya da askıdaki workspace'te her yazma aynı "hayır"ı alır | Askıdaki workspace'te dört yazma dört farklı cevap veriyor: ad ve logo satırı sessizce 0, logo dosyası yükleniyor, checklist ✔, preferred name `authz.workspace_closed` | Eski kapı kapalı workspace'e bakmıyor | YENİ (BL-276 ailesi) | leave: medium / do: moderate |
| G-09 | 🟡 düşük | Settings sayfalarının başlığı aynı yerde (KARARLAR "Sayfa iskeleti, piksel eşitliği") | General başlığı eski bileşen (simge + 28 px). General → Documents geçişinde başlık y=30'dan y=80'e iniyor | `GeneralSettingsPage.tsx:292-322` `SettingsHeader`, 10 Settings sayfası kullanıyor; Documents `CatalogPageHeader` | BL-604 ailesi (YENİ alt madde: form sayfaları) | leave: low / do: safe |
| G-10 | 🟡 düşük | Telefonda taşma yok | "Manage logo" kartın sağından 18 px taşıyor | `styles.css:12007-12011` | BL-588 | değişmedi |
| G-11 | 🟡 düşük | Aynı işlevde aynı boy, yeşil yalnız asıl eylem (§2.A.7) | Dört yeşil düğme, dört genişlik; Manage logo 20 px içeride; 42 / 36 / 34 px üç düğme boyu; aç/kapa düğmeleri yeşil | `styles.css:11977-12036` | YENİ (BL-047'yi somutlar) | leave: low / do: safe |
| G-12 | 🟡 düşük | Pencere Esc ile kapanır, odak içeri girer, vazgeç beyaz | Logo penceresi Esc'i dinlemiyor, odak arkada kalıyor, vazgeç düğmesi yok, arka plan karartılmıyor, pasif Save koyu yeşil | `ScheduleLogoUploadDialog.tsx:142-170` (Esc dinleyicisi yok) | BL-711, BL-615 | değişmedi |
| G-13 | 🟡 düşük | Kullanıcı metninde workspace; ne yaptığını söyleyen kısa metin (P21) | "Organization…" metinleri; "Answer them here / Let them through"; "This is not the onboarding approval setting."; "Schedule logo" ile "Workspace logo" | `GeneralSettingsPage.tsx:118`, `:148-151`, `:237-266`; `ScheduleLogoUploadDialog.tsx:111` | BL-851 + YENİ (preferred name metni) | leave: low / do: safe |
| G-14 | 🟡 düşük | Erişimi olmayana erişim-yok kartı (`NoAccessState`) | Müdür ve çalışan adresi açınca sessizce başka sayfaya atılıyor | `PermissionRoute.tsx:57-58` | BL-176 (PermissionRoute) | değişmedi |
| G-15 | ❓ karar boşluğu | — | Workspace saat dilimi alanı yok. Oysa KK-169 K4 ("lokasyonsuz kişide workspace saat dilimi") ve BL-765 böyle bir alan varsayıyor | `workspaces` tablosunda kolon yok; `locations.timezone` | BL-765 + YENİ (ürün sorusu) | — |
| G-16 | 🟡 düşük | — | Yalnız sekme ya da satır sonundan oluşan ad kabul ediliyor (yalnız arayüz dışından); logo değişikliği denetim kaydına yazılmıyor; zaman damgaları tarayıcı saatinden | Ek A §3 | YENİ (3 küçük kalem) | leave: low / do: safe |
| G-17 | 🟡 düşük | İkiz kod yok (§2.A.4) | Logo dosyası doğrulaması iki yerde | `organization-data.ts:216-224`, `ScheduleLogoUploadDialog.tsx:325-333` | YENİ | leave: low / do: safe |
| G-18 | 🟡 düşük | Ham renk yok, etiket–denetim bağı doğru | `#d9dfdc`, `#59645f` ham; "Schedule logo" bir denetime bağlı olmayan `<label>` | `styles.css:11973`, `:12036`; `GeneralSettingsPage.tsx:123` | YENİ | leave: low / do: safe |

**Bayat / değişmiş:**
- BL-008 değişmiş: logo yükleme ve yerleşim var. Ayrı bir "workspace avatarı" istenmiyorsa kapanabilir.
- BL-047'nin kapsamı tanımsızdı; G-05, G-09, G-11, G-13 onu somutluyor.

**GUVENLIK-A bağı:**
- G-01 (BL-178), G-04, G-08 ve BL-232 yetki paketinin işi.
- Bu rapordaki ekran kanıtı (§3.3) ve alt ajanın geri alınan denemesi (Ek A §2), GUVENLIK-A'nın salt okur ölçümüyle karşılaştırılmalı. Fark varsa koordinatör birleştirir.
- **Çakışma uyarısı:** EKRAN-05 C1 checklist metnini değiştirmek için `GeneralSettingsPage.tsx`'e dokunacak. EKRAN-10 uygulaması da aynı dosyaya dokunur.

## 6. Kod testi

**Koşulanlar** (alt ajan, 2026-10-07, `5b0dbca1`):

| Komut | Sonuç |
|---|---|
| `pnpm.cmd --filter @newfork/web exec vitest run` GeneralSettingsPage, settings-no-access, SettingsPageAlignment, WorkspacePage, PendingPreferredNameRow, scheduleGates, NotificationSettingsNavigation, tenant-query-cache (8 dosya) | 47 / 48 yeşil. Kırmızı olan `settings-no-access` "Locations": toplu koşuda 1588 ms ile `findBy`'ın 1 sn sınırını aştı. Dosya tek başına 10 / 10 yeşil, yani yükten kaynaklanıyor |
| `… vitest run src/schedule/components/ScheduleLogoUploadDialog.test.tsx` | 4 / 4 yeşil |
| `pnpm.cmd --filter @newfork/api exec vitest run` communication-routes, employee-directory-routes, communication-service | 102 / 102 yeşil |
| pgTAP | Koşulmadı (ağır koşu yasak). Yalnız okundu |

**Eksik vakalar** (test yazılmadı, liste):
1. Özel müdür + `settings.general.manage` ad, logo ve checklist yazamamalı. `roles_permissions_rls.test.sql:133-139` ters çevrilmeli (G-01).
2. Roles ekranı "General" alanını müdür rolüne sunmamalı (G-01).
3. Admin checklist'i değiştirebilir mi: ürün kararı EKRAN-05 S3 (G-07).
4. Askıdaki ya da kapanan workspace'te dört yazma da aynı cevabı vermeli (G-08).
5. 0 satır döndüğünde ekran "saved" dememeli (G-04).
6. Logo yüklendi ama satır güncellenemedi: dosya silinmeli (G-03).
7. Eski logo ve "Remove" sonrası dosya kovadan gitmeli (G-02).
8. Türkçe harf reddi web, shared ve DB'de (G-06).
9. Yalnız sekme ya da satır sonundan oluşan ad (G-16).
10. General için erişim-yok kartı. `settings-no-access` testinde General yok (G-14).
11. Düzenleme yetkisi olmayanda dört denetim de kapalı olmalı.
12. Ad kaydetme: başarı, hata, değişmediyse kapalı.
13. Preferred name düğmesinin sayfa testi.
14. Checklist rotasının 403 testi. Var olan 404 testi eski gövdeyle (`communication-routes.test.ts:202`).
15. Ham hata cümlesinin çevrilmesi (BL-620).
16. Logo penceresinde Esc ve odak (G-12).

## 7. Tasarımlar

**https://claude.ai/artifact/Kwz63F5JeddW5S7y2kSsAi** (v2, 2026-10-07; v1 önerisizdi). Yerel kopya: `newfork-clean/artifacts/EKRAN-10-GENERAL/settings-general-varyantlar.html`.

**Altısında da aynı:**
- Bosphorus Kitchen, logosu, saat dilimi özeti (America/Los_Angeles, üç lokasyon), Setup checklist, Preferred names.
- **Tek Save sağ altta**, vazgeç (Cancel) beyaz, yalnız Save yeşil, düğmeler 36 px.
- Documents ile aynı başlık. Metinlerde "workspace". Preferred name seçenekleri "Auto approve / Manager approval".
- Masaüstü 1440 ve telefon 390. Sayfada denenebilir: yazınca Save açılıyor.

| | Ad | Neyi farklı yapıyor · artısı · eksisi |
|---|---|---|
| A | Satır listesi | Bugünkü iki sütun, tek kartta, denetimler aynı çizgide · en tanıdık, en az iş · ayar çoğalınca uzun liste |
| B | Canlı önizleme | Solda form, sağda ad ve logonun menüde, Schedule'da, davet e-postasında görünüşü · logo yerleştirirken sonuç görünür · en geniş, bakım ister |
| C | Bölümlü tek sütun | Kartsız üç bölüm, etiket üstte, Save hep görünen alt çubukta · en sade, telefonda aynen çalışır · geniş ekranda sağ boş |
| D | Kompakt satırlar | Her ayar 64 px tek satır, sağda küçük denetim · en kısa sayfa, tek bakışta · açıklama tek satıra sığmalı |
| E | Marka kartı | Logo yerleşimi sayfanın içinde, pencere yok; tercih edilen ad iki eşit kart · her şey tek Save'le · az kullanılan iş en büyük alanı alıyor |
| F | Eşit kartlar | 2 × 2 eşit kart (öneriler açıkken 2 × 3), denetimler kart diplerinde hizalı · en simetrik · kart sayısı tek olursa ızgara bozulur |

### 7.1 General'a eklenebilecekler (Mert'in 2026-10-07 isteği)

Kaynaklar: KARARLAR, BACKLOG, KOORDINATOR-KARARLARI, kod ve rakiplerin General sayfaları (yalnız referans).

**Önerilen dört özellik.** Tasarım sayfasında kesik turuncu çerçeveyle gösteriliyor ve altı varyantın hepsine yerleştirildi.

| # | Öneri | Ne yapar, örnek | Dayanak | Bedel | Öneri |
|---|---|---|---|---|---|
| Ö1 | Workspace saat dilimi | Lokasyonu olmayan kişi ve workspace geneli tarihler için varsayılan saat dilimi; lokasyonlar kendi saat dilimini korur, varsayılan ilk lokasyonunki. Örnek: muhasebeci Dana'nın lokasyonu yok; işten çıkarma ve belge tarihleri Pacific Time ile yazılır (bugün Dana işten çıkarılamıyor, BL-765) | KK-169 K4 ve BL-765 bu alanı varsayıyor ama alan yok; EKRAN-07 S2 ve geçmiş hafta kilidi (BACKLOG:9 (c)) de buna bakabilir | Yeni kolon + çekirdek + 4 ekran. Temel model: önce sohbet (P18) | Ekle, karar ister |
| Ö2 | Tek logo her yerde | Yeni ayar değil. Logo sol menüde, workspace seçicide, davet e-postasında ve çalışan uygulamasında da görünür. Örnek: Emre davet e-postasında Bosphorus Kitchen logosunu görür, doğru işletmeye katıldığını anlar | MVP sonucu "çalışan doğru workspace'e katılır" (CLAUDE.md §1); BL-008 bununla kapanır | Orta; yeni veri yok | Ekle |
| Ö3 | Sahiplik ve kapatma bağlantısı (yalnız owner) | General'da "Transfer ownership or close this workspace → Account → Workspaces" satırı; işin kendisi yerinde kalır | KARARLAR "Owner'a özel: … sahiplik devri, workspace kapatma"; bilgi tek yerde (bağlantı, kopya değil) | Küçük | Ekle |
| Ö4 | Plan özeti (yalnız owner) | "Free trial · 12 days left" + Billing bağlantısı | Stripe MVP'de (ekran 18) | Billing'e bağlı | Billing (18) ile birlikte |

**Eklemediklerim:**
- İşletme telefonu ve e-postası: kural rol göstermek, kişi bilgisi değil (KARARLAR "Erişim yönlendirme metni").
- Resmî şirket adı ve adres: Billing'e (18) ait.
- Hafta başlangıcı ve saat biçimi: zaten Schedule rules'ta.
- Workspace ID: bugünkü metin anıyor ama ID hiçbir yerde görünmüyor. Gerekirse Support'a; General'dan metin çıkar.
- Marka rengi ve tema: tek tema (§2.A.7).
- Dil, bölge, para birimi: P12; bordro MVP sonrası.
- Workspace verisini indirme: MVP sonrası, yeri Account.
- "Onboarding approval" ayarı: metin bu ayara gönderme yapıyor ama veritabanında böyle bir ayar yok (yalnız `employee_name_settings.preferred_name_approval` var). Metin çıkar (G-13).

## 8. Mert'e sorular (tek tek, tıklamalı sorulacak)

1. **Altı tasarımdan hangisi?** (P04; önerilen koordinatörün.)
2. **Tek Save:** "Hide checklist" ve preferred name düğmesi bugün basınca kaydediyor. Altı tasarımda da Save'e bağlandı (KARARLAR "Kaydetme"). Bu bir davranış farkı, onay ister (P03).
3. **Hangi öneriler girsin?** Çoklu seçim, Ö1–Ö4 (§3.6: kategori sorusu çoklu seçimle). Önerilen: Ö2 ve Ö3 hemen, Ö4 Billing ile, Ö1 sohbetten sonra.
4. **Workspace saat dilimi (Ö1):**
   - Bugün yok, yalnız lokasyon saat dilimi var.
   - Tasarımlarda salt okunur bir özet ve Locations bağlantısı var.
   - Seçenekler: özet kalsın · gerçek bir "workspace saat dilimi" ayarı açılsın (KK-169 K4 ve BL-765 bunu varsayıyor; yeni temel model, önce sohbette, P18) · hiç gösterilmesin.
5. **Kurulum listesini admin de gizleyebilsin mi?** EKRAN-05 S3 ile aynı soru, oradan gelir.

## 9. Kanıt dosyaları

`C:\Users\TheWe\Documents\Codex\newfork-clean\artifacts\EKRAN-10-GENERAL\`:

| Dosya | Ne gösteriyor |
|---|---|
| `owner-meyhouse-1440.png`, `owner-meyhouse-390.png` | Bugünkü sayfa (telefonda logo düğmesi taşıyor) |
| `admin-zeynep-1440.png`, `admin-zeynep-390.png` | Admin aynı sayfayı görüyor |
| `manager-ayse-1440.png`, `employee-emre-1440.png` (+390) | Müdür ve çalışan başka sayfaya atılıyor |
| `owner-1440-logo-dialog.png`, `owner-390-logo-dialog.png` | Logo penceresi: vazgeç yok, arka plan karartılmıyor |
| `owner-1440-documents-header-compare.png` | Documents başlığı (karşılaştırma) |
| `owner-1440-turkish-typed.png` | Türkçe ad yazıldı, Save açık, uyarı yok |
| `admin-1440-turkish-saved.png` | Türkçe ad kaydedildi, sol menüde |
| `admin-1440-after-toggles.png` | Anında kaydeden düğmeler |
| `custom-manager-1440-general.png`, `custom-manager-1440-after-save.png`, `custom-manager-1440-toggles.png` | Özel müdür adı değiştiriyor (BL-178) |
| `manager-1440-stale-permission-save.png`, `manager-1440-stale-permission-toggles.png` | 0 satır, ekran "saved" |
| `admin-1440-logo-replaced.png` | Logo değiştirildi (eski dosya kovada) |
| `settings-general-varyantlar.html` | Tasarım sayfasının yerel kopyası (v2) |
| `tour.json`, `measure.json`, `write-*.json` | Ham ölçümler |

## Ek A — Kod ve veritabanı izi (alt ajan raporu, olduğu gibi)

### Settings → General: keşif raporu (salt okur, 2026-10-07, taban `5b0dbca1`, yerel veritabanı)

Kod, migration ya da test dosyası yazmadım; commit yok. Yerel veritabanındaki her deneme `begin … rollback` içinde koştu. Deneme betikleri scratchpad'de: `matrix.sql`, `probe2.sql`, `names.sql`, `logo-delete.sql`. Worktree temiz (`git status` boş). Yalnız `pnpm install` ve shared/ui build'i koştu.

#### 1. Uçtan uca iz

| Yazma | Web | API | Veritabanı | Yetkiyi kim soruyor |
|---|---|---|---|---|
| Ad | `GeneralSettingsPage.tsx:87` → `organization-data.ts:233-242` | Yok. Tarayıcı supabase-js ile doğrudan yazıyor | `UPDATE workspaces` | RLS `workspaces_update_manager` → `workspace_has_permission(…,'settings.general.manage')` → eski `service_actor_has_permission` (`schema.sql:33646`, `:6052-6057`, `:22893-22902`). Çekirdek yok |
| Logo | `:102` → `organization-data.ts:91-155` | Yok | `workspace-logos` kovasına dosya + `UPDATE workspaces` | Depolama politikaları insert/update/delete aynı eski kapıyla (aşağıda 2) |
| Checklist | `communications-data.ts:114-124` | `PATCH /v1/workspaces/:id/workspace/setup-checklist` (`communication-routes.ts:352-389`). Rota içi eski kapı `resolveWorkspaceAuthorization` + `permissions.includes` (`auth/workspace-context.ts:103`) | `set_owner_setup_checklist_closed_service` | Eski kapı, ret ipucusuz 42501 "workspace management required" (`schema.sql:23403`). Katalog bu fonksiyonu `workspace.setup` (yalnız owner) sayıyor (`authorization_coverage.test.sql:240`) ama fonksiyon o kontrolü çağırmıyor |
| Preferred name | `employee-data.ts:406-415` | `PUT /v1/workspaces/:id/preferred-name-approval` (`employee-directory-routes.ts:306-333`). Rota kapısı yok | `set_employee_name_settings_service` | Çekirdek: `app_private.authorize(…,'settings.people')` (`schema.sql:23276`), izni `settings.general.manage` ve sınıf kuralı var |

**Okuma tarafı:**
- Sayfa `useAuth().context.workspace`'ten şunları alıyor: `id`, `name`, `logo_url`, `logo_file_name`, `logo_updated_at`, `schedule_logo_placement`.
- Düzenleme yetkisi için `context.permissions` okunuyor (`:31-32`).
- Kaynak zinciri: `GET /v1/context` (`app.ts:445`) → `resolve_workspace_context_service` → `logo_url` sunucuda public adrese çevriliyor (`workspace-context.ts:198-206`).
- Kaydetmeden önce logo yolu ayrıca tarayıcıdan okunuyor (`organization-data.ts:157-167`). Checklist ve preferred name okumaları API'den geliyor.

#### 2. Rol matrisi (yerel veritabanında ölçüldü)

**İzin kataloğu:**
- `settings.general.manage`: `custom_grantable = t`, `employee_eligible = f`.
- Korunan liste yalnız `roles.manage` ve `workspace.manage` (`schema.sql:22341`). Bu izin listede yok.
- Sistem rolleri (472 workspace): owner 472/472, admin 472/472, Manager 0/472, Employee 0/472.
- Özel müdür rolü 18 tane var, hiçbirinde bu izin yok. Yerel veride bu izni taşıyan özel müdür **yok**; aşağıdaki satır geri alınan bir denemede kuruldu.

**Tablo ve kova ayarları:**
- `workspaces` politikaları: select = üye, insert = kurucu (ölü politika, çünkü tabloda INSERT izni yok), update = eski kapı.
- `authenticated` rolünün yalnız SELECT ve 8 kolonda UPDATE izni var: name, updated_at, 3 logo kolonu, 3 yerleşim kolonu.
- `workspace-logos` kovası: `public = t`, `file_size_limit = 5242880`, mime: jpeg, png, webp, svg+xml.
- Kovada INSERT, UPDATE ve DELETE politikaları var, **SELECT politikası yok**.

Deneme Meyhouse'ta yapıldı. Kullanılan hesaplar: test.admin, test.manager, test.employee ve owner.

| Kişi | Ad yaz | Logo (satır / dosya) | Checklist | Preferred name |
|---|---|---|---|---|
| Owner | 1 satır ✔ | ✔ / ✔ | ✔ | ✔ |
| Admin | ✔ | ✔ / ✔ | ✔ (katalog "yalnız owner" diyor) | ✔ |
| Yerleşik Manager | 0 satır, hata yok | 0 satır / 42501 RLS | 42501, ipucu yok | 42501 `authz.missing_permission` |
| Özel müdür + `settings.general.manage` (lokasyonlu da, all_locations da) | **1 satır ✔** | **✔ / ✔** | **✔** | 42501 `authz.out_of_scope` |
| Çalışan | 0 satır | 0 satır / 42501 | 42501, ipucu yok | 42501 `authz.missing_permission` |
| Başka workspace'in owner'ı | 0 satır | 0 / 42501 | 42501, ipucu yok | `authz.not_member` |

- **BL-178 bugün de geçerli.** Çekirdek özel müdür için `settings.organization.write` ve `settings.people` sorularına `out_of_scope` diyor; ad, logo ve checklist ise yazılıyor. Aynı sayfada aynı kişiye dört yazmadan üçü "evet", biri "hayır".
- **BL-178: Roles ekranı da bu izni müdüre sunuyor.** `role-permissions.ts:143-159`: "General" alanı `adminOnly` değil. Mert'in 2026-09-26 kararı bunun tersi: ekran bu seçeneği sunmamalı.
- **BL-178: bir pgTAP testi hatalı davranışı kilitliyor.** `roles_permissions_rls.test.sql:133-139` "müdür rolü `settings.general.manage` ile adı değiştirir" diye doğruluyor. Matris aynı durumda "hayır" diyor (`authorization_matrix.test.sql:819-822`). İki test birbiriyle çelişiyor.
- **Askıya alınmış workspace'te dört yazma dört farklı cevap veriyor (YENİ, BL-276 ailesi):** admin için ad ve logo satırı 0 satır (sessiz), logo dosyası yükleniyor, checklist ✔, preferred name `authz.workspace_closed`.
- **Checklist (BL-808):** rota kapısı eski, servis eski kapıda, web checklist kartını rol adına göre gösteriyor (`WorkspacePage.tsx:180-183`).
  - Gizleme kişi başına kaydediliyor: tablo anahtarı `(workspace_id, user_id)`, `schema.sql:28557`. Ekran metni ise "for this workspace" diyor (`GeneralSettingsPage.tsx:200-202`). EKRAN-05 C1 bu metni değiştirecek; o görev `GeneralSettingsPage.tsx`'e dokunuyor, **dosya çakışma riski var**.

#### 3. Sunucu doğrulamaları

- **Ad:** tek kural CHECK `char_length(btrim(name))` 1–120 (`schema.sql:29548`). Tetikleyici yalnız denetim kaydı yazıyor (`:31499`). Denemeler:
  - Boş ve yalnız boşluk → 23514. 121 karakter → 23514. 120 karakter → kabul.
  - Yalnız sekme ya da yalnız satır sonu → kabul (`btrim` yalnız boşluğu siliyor). Arayüz zaten kırptığı için yalnız doğrudan çağrıyla oluyor (YENİ, düşük).
- **Türkçe harf kuralı hiçbir katmanda yok (BL-503):** `'Şişli Döner Ğİı'` kabul edildi.
  - Web input'ta yalnız `maxLength=120` ve `required` var (`:154-161`).
  - Shared şemada yalnız `trim().min(1).max(120)` var (`index.ts:184`, kurulum şemaları `:497`, `:519`, `:533`, `:543`, `:664`).
- **Ham hata metni (BL-620):** sunucu 23514 ile reddederse web ham cümleyi gösteriyor (`organization-data.ts:53-59`). Arayüz boş ve 121+ karakterli adı zaten engellediği için bu yalnız arayüz dışı çağrıda görülür.
- **Sessiz başarı (YENİ, P09 "veri sessizce düşmez"):** `updateOrganizationName` kaç satırın değiştiğine bakmıyor (`:237-241`). RLS 0 satır döndürünce PostgREST hatasız 204 veriyor ve ekran "Organization settings saved." yazıyor. Örnek: oturum açıkken rolü düşürülen admin, ya da askıdaki workspace. Logo satırında `.single()` 0 satırda ham "Cannot coerce…" hatası atıyor (BL-620).
- **Logo:**
  - SVG kabul ediliyor: istemci ve kova listesinde var (BL-282).
  - 5 MB sınırı iki yerde uygulanıyor: istemci (`organization-data.ts:221`) ve sunucu (kova `file_size_limit`).
  - Logo değişikliği denetim kaydına yazılmıyor (tetikleyici yalnız ad için).
  - Zaman damgaları (`updated_at`, `logo_updated_at`) istemcinin saatinden geliyor (`:117`, `:144`, `:239`).
- **Sahipsiz dosyalar:**
  - **Yükleme sonrası (YENİ):** dosya yükleniyor (`:132-139`), sonra satır güncellemesi başarısız olursa dosyayı silen kod yok (`:141-149`). Dosya kovada kalıyor.
  - **Eski logo hiç silinmiyor (YENİ, BL-360'tan ayrı).** Kovada SELECT politikası olmadığı için owner'ın gördüğü logo nesnesi sayısı 0. Storage API'nin silme SQL'i `DELETE … WHERE name = ANY … RETURNING *` (konteyner `storage-api v1.61.7`, `dist/storage/database/pg.js:778`). Bunu `authenticated` rolüyle taklit ettim: **DELETE 0**, hata yok.
  - Sonuç: logo değiştirmek de "Remove logo" da eski dosyayı public kovada, adresiyle erişilebilir bırakıyor. `remove()` çağrılarının hatası da okunmuyor (`:106-108`, `:152`).
  - Yan bilgi: yerelde kovada 0 nesne var, ama Meyhouse'un `logo_storage_path`'i dolu. Logo yerelde kırık.

#### 4. Workspace saat dilimi

- Workspace düzeyinde saat dilimi alanı **yok**: `workspaces` tablosunda (`schema.sql:29527-29552`), shared `workspaceSchema`'da (`index.ts:182-199`) ve hiçbir Settings sayfasında yok.
- Saat dilimi lokasyon başına tutuluyor: `locations.timezone NOT NULL` (`schema.sql:4120`, `:4137`). Settings → Locations'ta düzenleniyor (`LocationTimezoneField.tsx`). Kişisel bildirim saat dilimi ayrı (`notification_user_preferences.timezone`).
- Week start ve time format Settings → Scheduling'de (`SchedulingSettingsPage.tsx`, `schedulingSettingsSchema` `index.ts:1080-1091`). Adres lokasyonda.
- **Karar boşluğu (YENİ, ürün sorusu):** kayıtlar "workspace saat dilimi"ni varsayıyor ama böyle bir alan yok.
  - KK-169 K4: lokasyonsuz kişinin işten çıkarma penceresi "workspace saat dilimini sunar" (KARARLAR:379). BL-765 bu yüzden açık.
  - Saat dilimi modeli U11: "yedek workspace saati, varsayılan ilk lokasyonun". Rafta, yürürlükte değil (`research/BELGE-MIMARISI-uzlasma-2026-10-03.md:47`).
  - Haftanın ne zaman geçmiş sayılacağı sorusunda (c) seçeneği "workspace ana saat dilimi" (BACKLOG:9). Duyuru saati sorusu S2 (EKRAN-07).
  - Karar çıkarsa en doğal yer General olur.
- KARARLAR'da General'a ait başka bir alan yok (yalnız UI-03 başlık kuralı).
- Prototip (`newfork-prototype/proto-audit/P3.md:225-235`) General'ı uygulamayla aynı dört satırla çiziyor. Prototip notları:
  - E4: uygulamada Esc logo penceresini kapatmıyor (BL-711).
  - G3: logo penceresinin arka planı karartılmamış.

#### 5. Testler

**Koşulanlar:**
- Web: 8 dosya / 48 test toplu koşuda 47 yeşil, 1 kırmızı. Kırmızı `settings-no-access` "Locations" (1588 ms, `findBy` 1 sn sınırı). Dosya tek başına 10/10 yeşil, yani yükten kaynaklanıyor. Koşulan dosyalar: GeneralSettingsPage, settings-no-access, SettingsPageAlignment, WorkspacePage, PendingPreferredNameRow, scheduleGates, NotificationSettingsNavigation, tenant-query-cache.
- `ScheduleLogoUploadDialog.test.tsx`: 4/4 yeşil.
- API: communication-routes, employee-directory-routes ve communication-service: 102/102 yeşil.

**pgTAP (yalnız okundu):**
- Ad: `organization_basics_rls.test.sql:48` (owner yazar) ve `roles_permissions_rls.test.sql:136-139` (yukarıdaki hatalı kilit).
- Preferred name: `name_settings_and_own_contact_ask_the_core`, `preferred_name_approval`, `preferred_names_on_the_core`.
- Checklist: yalnız işaretleme (`workspace_rls.test.sql:777-820`). `set_owner_setup_checklist_closed_service` için davranış testi yok.
- Logo kovası için pgTAP yok.

**Eksik vakalar:**
1. Özel müdür + `settings.general.manage`: ad, logo ve checklist yazamamalı (BL-178). `roles_permissions_rls:136-139` ters çevrilmeli.
2. Admin checklist'i değiştirebilir mi: katalog "hayır" diyor, kod "evet" (BL-808, ürün sorusu S3).
3. Askıdaki ya da kapanan workspace'te dört yazma da aynı cevabı vermeli.
4. Adın 0 satır döndüğü durumda ekran "saved" dememeli.
5. Logo yüklendi ama satır güncellenemedi: dosya silinmeli.
6. Eski logo ve "Remove logo" sonrası dosya kovadan gerçekten gitmeli.
7. Türkçe harf reddi: web, shared ve DB katmanlarında.
8. Yalnız sekme ya da yalnız satır sonundan oluşan ad.
9. General için erişim-yok kartı (`settings-no-access`'te General yok).
10. Düzenleme yetkisi olmayan kişide dört kontrol de kapalı olmalı.
11. Ad kaydetme: başarı, hata ve "değişmedi ise kapalı".
12. Preferred name düğmesinin sayfa testi.
13. Checklist rotası için 403 testi. 404 testi var ama eski gövdeyle (`authz.not_member` yok, `communication-routes.test.ts:202`).
14. Ham hata cümlesinin çevrilmesi (BL-620).
15. Kaydetmeden çıkma: ad alanı küçük olduğu için P26'ya göre soru gerekmiyor; test de gerekmiyor.

#### 6. `permissions.includes` / `.has` sayımı

- Web, test dosyaları hariç: **34 satır** (21 `includes` + 13 `has`).
- Bunların **26'sı Settings'te** (15 `includes` + 11 `has`):
  - `SettingsHomeRedirect` 10
  - `JobAssignmentsDrawer` 5
  - `JobsSettingsPage` 2
  - `NotificationSettingsPage` 2
  - `GeneralSettingsPage:32`, `JobCatalogEditor`, `LocationsSettingsPage`, `RolesSettingsPage`, `SettingsLayout`, `ShiftTypesSettingsPage`, `ShiftLabelsSettingsPage`: 1'er
- İlgili maddeler BL-176 (web) ve BL-898 (API rotaları; `communication-routes` 2 burada).
- General'ın logo düğmesi `includes`'a bakıyor; Schedule'daki logo düğmesi `can('settings.organization.write')`'a (`scheduleGates.ts:18`). Bu yüzden özel müdür General'da düğmeyi açık, Schedule'da gizli görüyor (BL-178).

#### Backlog eşlemesi

- **Geçerli:** BL-178, BL-232, BL-176, BL-898, BL-808, BL-282, BL-360, BL-503, BL-588 (kodda görüldü, telefonda ölçülmedi), BL-620, BL-711, BL-765, BL-851 (metin hâlâ "Organization").
- **BL-008:** değişmiş. Logo yükleme var; ayrı bir "workspace avatarı" istenmiyorsa kapanabilir.
- **BL-047:** belirsiz. EKRAN-10'un içinde erir.
- **YENİ:**
  - Eski logo hiç silinmiyor (SELECT politikası yok).
  - Yükleme yarıda kalınca dosya sahipsiz kalıyor.
  - Adın sessiz başarısı.
  - Askıdaki workspace'te dört farklı cevap.
  - Sekme ya da satır sonu adı.
  - Logo değişikliğinin denetim kaydı yok.
  - Zaman damgaları istemcide.
  - `logo_storage_path` CHECK'i yoldaki workspace önekini satırın kendi id'sine bağlamıyor (düşük).
  - Workspace saat dilimi karar boşluğu.

#### Kanıtlanamayanlar

- Eski logonun silinmediğini SQL taklidi ve storage-api kodundan çıkardım. Gerçek Storage API çağrısıyla denemedim, çünkü ortak yerel yığına yazmak gerekirdi.
- Depolamanın dosya içeriğine bakıp bakmadığı (yalnız bildirilen türe mi güveniyor) ve SVG'nin public adreste betik çalıştırıp çalıştırmadığı: denenmedi.
- Rolü oturum açıkken düşürülen admin'in ekranda gerçekten "saved" gördüğü: tarayıcıda denenmedi. Koddan ve 0 satır ölçümünden çıkarım.
- Askıdaki workspace'te sayfaya hiç ulaşılıp ulaşılamadığı: ölçülmedi.
- Bu ölçümler yalnız yerel veritabanında yapıldı; canlıda (hosted) bakılmadı.

> Ana oturumun notu (2026-10-07): "Kanıtlanamayanlar"daki ilk ve üçüncü madde sonradan gerçek uygulamada ölçüldü (GENERAL-INCELEME §3.4, §3.5). Eski logo dosyası gerçekten kovada kalıyor ve herkese açık adresinden açılıyor. Eski izinle kayıtta ekran gerçekten "saved" diyor.
